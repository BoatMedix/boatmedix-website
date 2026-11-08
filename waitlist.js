/* BoatMedix — Join the Crew waitlist + community feed.
   Talks to the BoatMedix Google Apps Script endpoint (see ops/waitlist).
   No customer data is stored in this website or its repository. */
// Production endpoint: the Apps Script web app owned by BoatMedix.
var BMX_ENDPOINT = '';
(function () {
  // Local testing only: allow ?wl=<url> on localhost / 127.0.0.1.
  var q = new URLSearchParams(location.search).get('wl');
  if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) BMX_ENDPOINT = q;
})();
(function () {
  var ENDPOINT = BMX_ENDPOINT;
  if (!document.getElementById('crew-form') && !document.getElementById('crew-wall')) return;

  var form = document.getElementById('crew-form');
  var count = document.getElementById('crew-count');
  var wall = document.getElementById('crew-wall');
  var started = Date.now();

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- Community feed + verified count ---------- */
  function renderFeed(feed) {
    if (count) {
      if (feed && typeof feed.count === 'number' && feed.count > 0) {
        count.textContent = feed.count.toLocaleString('en-US') + (feed.count === 1 ? ' boater has' : ' boaters have') + ' joined the crew!';
        count.hidden = false;
      } else { count.hidden = true; }
    }
    if (!wall) return;
    var list = (feed && Array.isArray(feed.comments)) ? feed.comments.filter(function (c) { return c && c.text; }) : [];
    if (!list.length) { wall.classList.remove('has'); return; }
    var grid = wall.querySelector('.cw-grid');
    grid.textContent = '';
    list.forEach(function (c) {
      var card = el('figure', 'cw-card');
      card.appendChild(el('blockquote', null, '\u201C' + c.text + '\u201D'));
      var cap = el('figcaption');
      var who = el('b', null, c.name || 'A future boater');
      cap.appendChild(who);
      if (c.place) cap.appendChild(el('span', null, c.place));
      card.appendChild(cap);
      grid.appendChild(card);
    });
    wall.classList.add('has');
  }
  function loadFeed() {
    if (!ENDPOINT) return renderFeed(null);
    fetch(ENDPOINT + (ENDPOINT.indexOf('?') < 0 ? '?' : '&') + 'feed=1', { cache: 'no-store' })
      .then(function (r) { return r.json(); }).then(renderFeed).catch(function () { renderFeed(null); });
  }
  loadFeed();

  if (!form) return;

  /* ---------- Form ---------- */
  var msg = form.querySelector('.cf-msg');
  var btn = form.querySelector('button[type=submit]');
  var ta = form.querySelector('textarea');
  var left = form.querySelector('.cf-left');
  var share = form.querySelector('[name=share]');
  if (ta && left) ta.addEventListener('input', function () { left.textContent = (280 - ta.value.length) + ' left'; share.disabled = !ta.value.trim(); if (share.disabled) share.checked = false; });
  if (share && ta) share.disabled = !ta.value.trim();

  var ERR = {
    first_name: 'Please add your first name.',
    email: 'Please check your email address.',
    links: 'Please leave out links. Just tell us in your own words.',
    too_fast: 'That was quick. Please take a second and try again.',
    busy: 'Lots of boaters are joining right now. Please try again in a minute.',
    verification: 'We couldn\u2019t verify the form. Please try again.',
    bad_request: 'Something went wrong. Please try again.'
  };
  function say(t, kind) { msg.textContent = t; msg.dataset.kind = kind || ''; }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = form.elements;
    var first = f.firstName.value.trim(), email = f.email.value.trim();
    if (!first) { say(ERR.first_name, 'err'); f.firstName.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say(ERR.email, 'err'); f.email.focus(); return; }
    if (!ENDPOINT) { say('The waitlist is being connected. Please check back shortly, or email hello@boatmedix.com.', 'err'); return; }
    var body = {
      firstName: first, email: email,
      location: f.location.value.trim(), comment: f.comment.value.trim(),
      marketing: f.marketing.checked, share: f.share.checked && !!f.comment.value.trim(),
      website: f.website.value, elapsed: Date.now() - started,
      turnstile: (f['cf-turnstile-response'] || {}).value || '',
      page: location.pathname
    };
    btn.disabled = true; say('Adding you to the crew\u2026', 'wait');
    // text/plain keeps this a "simple" request (no CORS preflight), which Apps Script requires.
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) { btn.disabled = false; say(ERR[res && res.error] || ERR.bad_request, 'err'); return; }
        var done = document.getElementById('crew-done');
        done.querySelector('h3').textContent = res.status === 'already' ? 'You\u2019re already on the crew list, ' + first + '.' : 'Welcome aboard, ' + first + '.';
        done.querySelector('p').textContent = res.status === 'already'
          ? 'Good news: you were already on the list, so there\u2019s nothing more to do. We\u2019ll be in touch when BoatMedix is ready.'
          : 'You\u2019re on the list. ' + (res.emailed ? 'A confirmation is on its way to ' + email + '. ' : '') + 'We\u2019ll let you know when BoatMedix is ready. Nothing to pay, and no subscription has started.';
        form.hidden = true; done.hidden = false; done.focus();
        loadFeed();
      })
      .catch(function () { btn.disabled = false; say('We couldn\u2019t reach the waitlist. Please check your connection and try again.', 'err'); });
  });
})();

/* ---------- Founding Marine Pro registration (/marinepro) ---------- */
(function () {
  var form = document.getElementById('pro-form');
  if (!form) return;
  var ENDPOINT = BMX_ENDPOINT, started = Date.now();
  var msg = form.querySelector('.msg'), btn = form.querySelector('button[type=submit]');
  function say(t, k) { msg.textContent = t; msg.dataset.kind = k || ''; }
  var ERR = {
    business: 'Please add your business or professional name.', contact: 'Please add your name.',
    email: 'Please check your email address.', phone: 'Please check your phone number.',
    site: 'Please check your website address.', based: 'Please tell us where you’re based.',
    type: 'Please choose what best describes you.', specialties: 'Please choose at least one specialty.',
    links: 'Please leave links out of the text fields. Your website has its own field.',
    too_fast: 'That was quick. Please take a moment and try again.',
    busy: 'Lots of people are registering right now. Please try again in a minute.',
    verification: 'We couldn’t verify the form. Please try again.', bad_request: 'Something went wrong. Please try again.'
  };
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = form.elements, v = function (n) { return (f[n].value || '').trim(); };
    var specs = Array.prototype.filter.call(form.querySelectorAll('[name=specialties]'), function (c) { return c.checked; }).map(function (c) { return c.value; });
    var radio = function (n) { var c = form.querySelector('[name=' + n + ']:checked'); return c ? c.value : ''; };
    var first = [['business', !v('business')], ['contact', !v('contact')], ['email', !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))], ['based', !v('based')], ['type', !v('type')], ['specialties', !specs.length]]
      .filter(function (x) { return x[1]; })[0];
    if (first) { say(ERR[first[0]], 'err'); var el = f[first[0]]; if (el && el.focus) el.focus(); else if (el && el[0]) el[0].focus(); return; }
    if (!ENDPOINT) { say('Registration is being connected. Please check back shortly, or email hello@boatmedix.com.', 'err'); return; }
    var body = {
      kind: 'pro', business: v('business'), contact: v('contact'), email: v('email'), phone: v('phone'), site: v('site'),
      based: v('based'), type: v('type'), specialties: specs, years: v('years'), quals: v('quals'), remote: radio('remote'),
      phoneOk: f.phoneOk.checked, videoOk: f.videoOk.checked, area: v('area'), afterHours: f.afterHours.checked,
      rates: radio('rates'), notes: v('notes'), updates: f.updates.checked, website2: f.website2.value,
      elapsed: Date.now() - started, page: location.pathname
    };
    btn.disabled = true; say('Sending your registration…', 'wait');
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) { btn.disabled = false; say(ERR[res && res.error] || ERR.bad_request, 'err'); return; }
        var d = document.getElementById('pro-done');
        d.querySelector('h3').textContent = res.status === 'already' ? 'You’re already registered.' : 'Thank you, ' + body.contact.split(' ')[0] + '.';
        d.querySelector('p').textContent = res.status === 'already'
          ? 'We already have a registration for ' + body.email + '. Nothing more to do. To update your details, email hello@boatmedix.com.'
          : 'Your interest in the founding Marine Pro Network is registered. ' + (res.emailed ? 'A confirmation is on its way to ' + body.email + '. ' : '') + 'We’ll be in touch as the network gets ready. Nothing is booked or charged.';
        form.hidden = true; d.hidden = false; d.focus(); d.scrollIntoView({ block: 'center' });
      })
      .catch(function () { btn.disabled = false; say('We couldn’t reach the registration service. Please check your connection and try again.', 'err'); });
  });
})();
