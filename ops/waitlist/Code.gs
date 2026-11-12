/**
 * BoatMedix — "Join the Crew" waitlist backend
 * ------------------------------------------------------------
 * Runs as a Google Apps Script bound to a private Google Sheet in the
 * BoatMedix Google Workspace account. The Sheet IS the database:
 *   - "Waitlist" tab: one row per person (private; never published)
 *   - "Settings" tab: simple switches you control
 *
 * The public website can only:
 *   POST  -> add a signup (validated, de-duplicated, rate limited)
 *   GET   -> read the verified signup count (only if you switch it on)
 *            and comments you have approved (first name, place, comment)
 * Email addresses are never returned to the website.
 *
 * Moderation: tick "Approve for website" on a row. A comment appears only
 * when the person ticked "Share publicly" AND you ticked "Approve".
 * Export: File > Download > CSV (or Excel) at any time.
 */

var CFG = {
  SHEET: 'Waitlist',
  SETTINGS: 'Settings',
  FROM_NAME: 'BoatMedix',
  REPLY_TO: 'info@boatmedix.com',
  NOTIFY_TO: 'info@boatmedix.com',   // every new signup and Marine Pro registration is emailed here
  CONSENT_VERSION: 'crew-2026-11-08',
  MARKETING_TEXT: 'Yes, send me BoatMedix launch updates and occasional news. I can unsubscribe at any time.',
  SHARE_TEXT: 'BoatMedix may publicly share my first name, general location and comment on its website and social channels.',
  MAX_PER_MINUTE: 20,      // whole-site safety valve against floods
  MIN_FILL_MS: 2500,       // humans take longer than this to fill the form
  FEED_CACHE_SECONDS: 60,  // approvals appear on the site within about a minute
  FEED_MAX_COMMENTS: 12
};

var HEAD = [
  'Joined (UTC)', 'First name', 'Email', 'Home lake / location', 'Excited about',
  'Marketing updates', 'Share publicly', 'Approve for website', 'Status',
  'Confirmation email', 'Source page', 'Consent version',
  'Marketing consent wording', 'Share consent wording'
];
var COL = {}; HEAD.forEach(function (h, i) { COL[h] = i + 1; });

/* ---------------------------- Web endpoints ---------------------------- */

function doPost(e) {
  var data;
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  if (data.kind === 'pro') return proPost_(data);

  // Anti-spam 1: hidden honeypot field. Bots fill it; people never see it.
  if (str_(data.website)) return json_({ ok: true, status: 'joined' });
  // Anti-spam 2: forms completed impossibly fast are rejected.
  if (!(Number(data.elapsed) >= CFG.MIN_FILL_MS)) return json_({ ok: false, error: 'too_fast' });
  // Anti-spam 3: optional Cloudflare Turnstile (only if a secret is configured).
  if (!turnstileOk_(data.turnstile)) return json_({ ok: false, error: 'verification' });
  // Anti-spam 4: site-wide rate limit.
  if (!rateOk_()) return json_({ ok: false, error: 'busy' });

  var first = clean_(data.firstName, 40);
  var email = clean_(data.email, 254).toLowerCase();
  var place = clean_(data.location, 80);
  var comment = clean_(data.comment, 280);
  var marketing = data.marketing === true;
  var share = data.share === true && comment !== '';
  var page = clean_(data.page, 120);

  if (!first || !/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u.test(first)) return json_({ ok: false, error: 'first_name' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json_({ ok: false, error: 'email' });
  if (/(https?:\/\/|www\.|<|>)/i.test(first + ' ' + place + ' ' + comment)) return json_({ ok: false, error: 'links' });

  var sheet = sheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var row;
  try {
    // De-duplicate on the normalised email address.
    var last = sheet.getLastRow();
    if (last > 1) {
      var emails = sheet.getRange(2, COL['Email'], last - 1, 1).getValues();
      for (var i = 0; i < emails.length; i++) {
        if (String(emails[i][0]).trim().toLowerCase() === email) {
          return json_({ ok: true, status: 'already' });
        }
      }
    }
    var values = [];
    values[COL['Joined (UTC)'] - 1] = new Date().toISOString();
    values[COL['First name'] - 1] = safe_(first);
    values[COL['Email'] - 1] = safe_(email);
    values[COL['Home lake / location'] - 1] = safe_(place);
    values[COL['Excited about'] - 1] = safe_(comment);
    values[COL['Marketing updates'] - 1] = marketing;
    values[COL['Share publicly'] - 1] = share;
    values[COL['Approve for website'] - 1] = false;
    values[COL['Status'] - 1] = 'Active';
    values[COL['Confirmation email'] - 1] = 'Pending';
    values[COL['Source page'] - 1] = safe_(page);
    values[COL['Consent version'] - 1] = CFG.CONSENT_VERSION;
    values[COL['Marketing consent wording'] - 1] = marketing ? CFG.MARKETING_TEXT : '';
    values[COL['Share consent wording'] - 1] = share ? CFG.SHARE_TEXT : '';
    sheet.appendRow(values);
    row = sheet.getLastRow();
    checkboxes_(sheet, row, 1);
  } finally {
    lock.releaseLock();
  }

  var mailStatus = 'Off';
  if (setting_('Send confirmation email', true)) {
    try { sendConfirmation_(email, first, marketing, share); mailStatus = 'Sent'; }
    catch (err) { mailStatus = 'Failed: ' + String(err).slice(0, 80); }
  }
  sheet.getRange(row, COL['Confirmation email']).setValue(mailStatus);
  try { notifyTeam_('New waitlist signup: ' + first, [
    ['First name', first], ['Email', email], ['Home lake / location', place], ['Excited about', comment],
    ['Marketing updates', marketing ? 'Yes' : 'No'], ['Share publicly', share ? 'Yes' : 'No'], ['Source page', page],
    ['Confirmation email', mailStatus]], email); } catch (err) {}
  clearFeed_();
  return json_({ ok: true, status: 'joined', emailed: mailStatus === 'Sent' });
}

function doGet(e) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('feed');
  if (hit) return text_(hit);
  var feed = JSON.stringify(buildFeed_());
  cache.put('feed', feed, CFG.FEED_CACHE_SECONDS);
  return text_(feed);
}

function buildFeed_() {
  var sheet = sheet_();
  var last = sheet.getLastRow();
  var rows = last > 1 ? sheet.getRange(2, 1, last - 1, HEAD.length).getValues() : [];
  var active = rows.filter(function (r) { return r[COL['Status'] - 1] !== 'Removed' && r[COL['Email'] - 1]; });
  var count = active.length;
  var show = setting_('Show signup count on website', false) && count >= Number(setting_('Minimum count before showing', 25));
  var comments = active.filter(function (r) {
    return r[COL['Share publicly'] - 1] === true && r[COL['Approve for website'] - 1] === true && String(r[COL['Excited about'] - 1]).trim();
  }).reverse().slice(0, CFG.FEED_MAX_COMMENTS).map(function (r) {
    return {
      name: unsafe_(r[COL['First name'] - 1]),
      place: unsafe_(r[COL['Home lake / location'] - 1]),
      text: unsafe_(r[COL['Excited about'] - 1])
    };
  });
  return { ok: true, count: show ? count : null, comments: comments, updated: new Date().toISOString() };
}

/* ------------------- Marine Pro registrations ------------------- */

var PRO_SHEET = 'Marine Pros';
var PRO_HEAD = [
  'Registered (UTC)', 'Business or professional name', 'Contact name', 'Email', 'Phone', 'Website',
  'Based in', 'Professional type', 'Specialties', 'Years of experience', 'Qualifications',
  'Remote consultations', 'Phone consults', 'Video consults', 'In-person service area',
  'After-hours (optional)', 'Interest in setting rates', 'Notes', 'Network updates',
  'Review status', 'Confirmation email', 'Consent version'
];
var PCOL = {}; PRO_HEAD.forEach(function (h, i) { PCOL[h] = i + 1; });
var PRO_TYPES = ['Independent marine professional', 'Dealership technician', 'Mobile marine service provider', 'Marina or service business', 'Towing provider', 'Other'];
var PRO_SPECIALTIES = ['Outboard engines', 'Inboard and sterndrive', 'Diesel engines', 'Electrical systems', 'Marine electronics', 'Fuel systems', 'Steering and controls', 'Hull and fiberglass', 'Trailers', 'Towing', 'Other'];
var PRO_YEARS = ['Under 2', '2 to 5', '6 to 10', '11 to 20', 'More than 20'];
var PRO_REMOTE = ['Yes', 'Maybe', 'In-person only'];
var PRO_RATES = ['Yes', 'Not sure yet', 'No'];

function proPost_(d) {
  if (str_(d.website2)) return json_({ ok: true, status: 'joined' });               // honeypot
  if (!(Number(d.elapsed) >= CFG.MIN_FILL_MS * 2)) return json_({ ok: false, error: 'too_fast' });
  if (!turnstileOk_(d.turnstile)) return json_({ ok: false, error: 'verification' });
  if (!rateOk_()) return json_({ ok: false, error: 'busy' });

  var r = {
    business: clean_(d.business, 100), contact: clean_(d.contact, 60), email: clean_(d.email, 254).toLowerCase(),
    phone: clean_(d.phone, 30), site: clean_(d.site, 200), based: clean_(d.based, 80),
    type: oneOf_(d.type, PRO_TYPES), years: oneOf_(d.years, PRO_YEARS),
    specialties: (Array.isArray(d.specialties) ? d.specialties : []).map(function (x) { return oneOf_(x, PRO_SPECIALTIES); }).filter(String).join(', '),
    quals: clean_(d.quals, 600), remote: oneOf_(d.remote, PRO_REMOTE),
    phoneOk: d.phoneOk === true, videoOk: d.videoOk === true, area: clean_(d.area, 160),
    after: d.afterHours === true, rates: oneOf_(d.rates, PRO_RATES), notes: clean_(d.notes, 600), updates: d.updates === true
  };
  if (!r.business) return json_({ ok: false, error: 'business' });
  if (!r.contact) return json_({ ok: false, error: 'contact' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) return json_({ ok: false, error: 'email' });
  if (r.phone && !/^[0-9+().\-\s x]{7,30}$/i.test(r.phone)) return json_({ ok: false, error: 'phone' });
  if (r.site && !/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/[^\s<>]*)?$/i.test(r.site)) return json_({ ok: false, error: 'site' });
  if (!r.based) return json_({ ok: false, error: 'based' });
  if (!r.type) return json_({ ok: false, error: 'type' });
  if (!r.specialties) return json_({ ok: false, error: 'specialties' });
  if (/(https?:\/\/|www\.|<|>)/i.test([r.business, r.contact, r.based, r.quals, r.area, r.notes].join(' '))) return json_({ ok: false, error: 'links' });

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(PRO_SHEET) || setupPros_();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var row;
  try {
    var last = sh.getLastRow();
    if (last > 1) {
      var em = sh.getRange(2, PCOL['Email'], last - 1, 1).getValues();
      for (var i = 0; i < em.length; i++) if (String(em[i][0]).trim().toLowerCase() === r.email) return json_({ ok: true, status: 'already' });
    }
    var v = [new Date().toISOString(), r.business, r.contact, r.email, r.phone, r.site, r.based, r.type, r.specialties, r.years,
      r.quals, r.remote, r.phoneOk, r.videoOk, r.area, r.after, r.rates, r.notes, r.updates, 'New', 'Pending', CFG.CONSENT_VERSION].map(function (x) {
      return typeof x === 'string' ? safe_(x) : x;
    });
    sh.appendRow(v);
    row = sh.getLastRow();
  } finally { lock.releaseLock(); }

  var mail = 'Off';
  if (setting_('Send confirmation email', true)) {
    try { sendProConfirmation_(r.email, r.contact, r.business); mail = 'Sent'; }
    catch (err) { mail = 'Failed: ' + String(err).slice(0, 80); }
  }
  sh.getRange(row, PCOL['Confirmation email']).setValue(mail);
  try { notifyTeam_('New Marine Pro registration: ' + r.business, [
    ['Business', r.business], ['Contact', r.contact], ['Email', r.email], ['Phone', r.phone], ['Website', r.site],
    ['Based in', r.based], ['Type', r.type], ['Specialties', r.specialties], ['Notes', r.notes],
    ['Confirmation email', mail]], r.email); } catch (err) {}
  return json_({ ok: true, status: 'joined', emailed: mail === 'Sent' });
}

function setupPros_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(PRO_SHEET) || ss.insertSheet(PRO_SHEET);
  sh.getRange(1, 1, 1, PRO_HEAD.length).setValues([PRO_HEAD]).setFontWeight('bold').setBackground('#012851').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, PRO_HEAD.length, 160);
  return sh;
}

function sendProConfirmation_(email, contact, business) {
  var lines = [
    '<p>Hi ' + esc_(contact) + ',</p>',
    '<p>Thank you for your interest in the BoatMedix Marine Pro Network\u2122 on behalf of ' + esc_(business) + '. We\u2019ve received your registration.</p>',
    '<p>The network is still being built. Bookings, consultations and payments are not live yet, and registering is free. We\u2019ll be in touch as we get closer to launch, including any steps to verify qualifications.</p>',
    '<p>Need to update something, or didn\u2019t register? Just reply to this email.</p>',
    '<p>BoatMedix\u2122 \u00b7 Never Boat Alone\u2122<br><a href="https://boatmedix.com/marinepro/">boatmedix.com/marinepro</a></p>'
  ];
  MailApp.sendEmail({
    to: email,
    subject: 'Thanks for registering for the Marine Pro Network',
    body: lines.join('\n\n').replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''),
    htmlBody: '<div style="font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0C1D21;max-width:560px">' + lines.join('') + '</div>',
    name: CFG.FROM_NAME,
    replyTo: CFG.REPLY_TO
  });
}

function oneOf_(v, list) { v = str_(v); return list.indexOf(v) >= 0 ? v : ''; }

/* ------------------------------ Email --------------------------------- */

// Emails the BoatMedix team (CFG.NOTIFY_TO) about each new signup.
// Reply-To is the person who signed up, so hitting Reply answers them directly.
function notifyTeam_(subject, rows, replyTo) {
  if (!CFG.NOTIFY_TO || !setting_('Email me new signups', true)) return;
  var plain = rows.map(function (r) { return r[0] + ': ' + (r[1] || '\u2014'); }).join('\n');
  var html = '<table style="font:15px/1.5 Arial,sans-serif;color:#012851;border-collapse:collapse">' + rows.map(function (r) {
    return '<tr><td style="padding:4px 14px 4px 0;font-weight:bold;vertical-align:top">' + esc_(r[0]) + '</td><td style="padding:4px 0">' + esc_(r[1] || '\u2014') + '</td></tr>';
  }).join('') + '</table>';
  MailApp.sendEmail({ to: CFG.NOTIFY_TO, subject: subject, body: plain, htmlBody: html, name: 'BoatMedix Website', replyTo: replyTo || CFG.REPLY_TO });
}

function sendConfirmation_(email, first, marketing, share) {
  var name = esc_(first);
  var lines = [
    '<p>Hi ' + name + ',</p>',
    '<p>Thanks for joining the BoatMedix crew. We\u2019re getting everything ready for your best days on the water, and you\u2019ll be among the first to hear when BoatMedix is ready.</p>',
    '<p>Joining the waitlist is free. It doesn\u2019t start a subscription or charge you anything.</p>'
  ];
  if (marketing) lines.push('<p>You asked to receive launch updates and occasional news. To stop at any time, just reply with \u201cunsubscribe.\u201d</p>');
  if (share) lines.push('<p>You said we may share your first name, general location and comment. We read every comment before anything appears on our website, and we\u2019ll remove yours whenever you ask.</p>');
  lines.push('<p>Didn\u2019t sign up? Reply to this email and we\u2019ll remove your details.</p>');
  lines.push('<p>Less searching. More boating.<br>BoatMedix\u2122 \u00b7 Never Boat Alone\u2122<br><a href="https://boatmedix.com">boatmedix.com</a></p>');
  var plain = lines.join('\n\n').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '');
  MailApp.sendEmail({
    to: email,
    subject: 'Welcome aboard. You\u2019re on the BoatMedix crew list.',
    body: plain,
    htmlBody: '<div style="font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0C1D21;max-width:560px">' + lines.join('') + '</div>',
    name: CFG.FROM_NAME,
    replyTo: CFG.REPLY_TO
  });
}

/* --------------------------- Sheet set-up ------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('BoatMedix')
    .addItem('Set up waitlist tabs', 'setup')
    .addItem('Refresh website now', 'refreshWebsite')
    .addItem('Send a test confirmation to me', 'testEmail')
    .addToUi();
}

// Simple trigger: when you tick "Approve", the website refreshes right away.
function onEdit(e) { try { clearFeed_(); } catch (err) {} }

function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CFG.SHEET) || ss.insertSheet(CFG.SHEET);
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#0B1F3A').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, HEAD.length, 150);
  sh.setColumnWidth(COL['Excited about'], 320);
  sh.getRange(1, COL['Approve for website']).setBackground('#2E8C86');
  var st = ss.getSheetByName(CFG.SETTINGS) || ss.insertSheet(CFG.SETTINGS);
  if (st.getLastRow() < 2) {
    st.getRange(1, 1, 5, 3).setValues([
      ['Setting', 'Value', 'What it does'],
      ['Show signup count on website', false, 'Tick to show "N boaters have joined the crew!" on the homepage. The number always comes from this sheet.'],
      ['Minimum count before showing', 25, 'The count stays hidden until real signups reach this number.'],
      ['Send confirmation email', true, 'Sends a short welcome email from this account after each new signup.'],
      ['Email me new signups', true, 'Emails info@boatmedix.com about every new signup and Marine Pro registration.']
    ]);
    st.getRange(1, 1, 1, 3).setFontWeight('bold');
    st.getRange(2, 2).insertCheckboxes();
    st.getRange(4, 2).insertCheckboxes();
    st.getRange(2, 2).setValue(false);
    st.getRange(4, 2).setValue(true);
    st.getRange(5, 2).insertCheckboxes();
    st.getRange(5, 2).setValue(true);
    st.setColumnWidth(1, 240); st.setColumnWidth(3, 520);
  } else {
    // Existing sheet: add the new-signup email switch if it isn't there yet.
    var keys = st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; });
    if (keys.indexOf('Email me new signups') < 0) {
      var n = st.getLastRow() + 1;
      st.getRange(n, 1, 1, 3).setValues([['Email me new signups', true, 'Emails info@boatmedix.com about every new signup and Marine Pro registration.']]);
      st.getRange(n, 2).insertCheckboxes();
      st.getRange(n, 2).setValue(true);
    }
  }
  setupPros_();
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(def);
  clearFeed_();
}

function refreshWebsite() { clearFeed_(); }

function testEmail() {
  var me = Session.getActiveUser().getEmail();
  sendConfirmation_(me, 'Allison', true, true);
  notifyTeam_('TEST: new waitlist signup notification', [['First name', 'Test'], ['Email', me], ['Note', 'This is a test from the BoatMedix waitlist script.']], me);
}

/* ------------------------------ Helpers -------------------------------- */

function sheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CFG.SHEET);
  if (!sh) { setup(); sh = ss.getSheetByName(CFG.SHEET); }
  return sh;
}

function checkboxes_(sh, row, n) {
  var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  ['Marketing updates', 'Share publicly', 'Approve for website'].forEach(function (h) {
    sh.getRange(row, COL[h], n, 1).setDataValidation(rule);
  });
}

function setting_(key, dflt) {
  var st = SpreadsheetApp.getActive().getSheetByName(CFG.SETTINGS);
  if (!st || st.getLastRow() < 2) return dflt;
  var v = st.getRange(2, 1, st.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < v.length; i++) if (v[i][0] === key) return v[i][1] === '' ? dflt : v[i][1];
  return dflt;
}

function rateOk_() {
  var cache = CacheService.getScriptCache();
  var key = 'rate_' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 120);
  return n <= CFG.MAX_PER_MINUTE;
}

function turnstileOk_(token) {
  var secret = PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET');
  if (!secret) return true; // Turnstile not enabled
  if (!token) return false;
  var res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post', payload: { secret: secret, response: String(token) }, muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()).success === true; } catch (err) { return false; }
}

function clearFeed_() { CacheService.getScriptCache().remove('feed'); }
function str_(v) { return v == null ? '' : String(v); }
function clean_(v, max) { return str_(v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
// Stop spreadsheet formula injection (values starting with = + - @).
function safe_(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; }
function unsafe_(v) { v = str_(v); return v.charAt(0) === "'" ? v.slice(1) : v; }
function esc_(v) { return str_(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function json_(o) { return text_(JSON.stringify(o)); }
function text_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }
