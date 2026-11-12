# BoatMedix "Join the Crew" waitlist — setup and day-to-day

The waitlist uses a private Google Sheet in the BoatMedix Google Workspace account plus a small
Google Apps Script (`Code.gs` in this folder). No paid services, no servers to maintain, and the
customer list never touches this public repository or the website files.

## One-time setup (about 10 minutes)

1. Signed in as hello@boatmedix.com, create a new Google Sheet named **BoatMedix Waitlist**.
2. In the Sheet: **Extensions > Apps Script**. Delete the sample code, paste all of `Code.gs`, save.
3. In the Apps Script editor, choose the `setup` function and click **Run**. Approve the permission
   prompt (it asks to manage this spreadsheet and send email as you). This creates the
   **Waitlist** and **Settings** tabs.
4. **Deploy > New deployment > Web app**
   - Execute as: **Me (hello@boatmedix.com)**
   - Who has access: **Anyone** (this lets the website submit the form; it does not give anyone access to the Sheet)
   - Click Deploy and copy the Web app URL (ends in `/exec`).
5. Put that URL in `waitlist.js` (`var ENDPOINT = '...'`), commit, and push.

After editing `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

## Approving comments for the website

- Open the **Waitlist** tab. A comment can only appear when the person ticked **Share publicly**.
- Tick **Approve for website** on the comments you want to feature. Untick to remove it.
- The website updates within about a minute (or use **BoatMedix > Refresh website now**).
- Only first name, the location they typed, and their comment are ever shown. Email addresses never leave the Sheet.

## Showing the signup count

- **Settings** tab: tick **Show signup count on website**.
- **Minimum count before showing** keeps the number hidden until real signups reach it (default 25).
- The number is always counted live from the Waitlist tab. Rows with Status = `Removed` are not counted.

## Removing someone / handling requests

- To stop marketing: untick **Marketing updates** for that row.
- To remove someone: delete the row (or set Status to `Removed` to keep a record).

## Exporting the list

**File > Download > Comma-separated values (.csv)** or Microsoft Excel. You own this data.

## Spam protection

Built in: hidden honeypot field, minimum fill time, link blocking, length limits, duplicate check,
site-wide rate limit, and protection against spreadsheet formula injection.
Optional upgrade (free): Cloudflare Turnstile. Add the secret as Script Property `TURNSTILE_SECRET`
and add the Turnstile widget to the form; the script verifies it automatically when the secret exists.

## Limits

Google Workspace accounts can send about 1,500 emails per day from Apps Script. The confirmation
email is sent from the Google account that owns the script (hello@boatmedix.com) with the name "BoatMedix".
Replies go to info@boatmedix.com.

## Where inquiries arrive

Every new waitlist signup and Marine Pro registration is emailed to **info@boatmedix.com**
(`NOTIFY_TO` in `Code.gs`). Hitting Reply answers the person directly. Switch it off with
**Email me new signups** on the Settings tab. Website contact forms (dealers, manufacturers,
Dock & Dine) and the Support link also go to info@boatmedix.com.

**After changing `Code.gs`:** paste it into the Apps Script editor, save, then
**Deploy > Manage deployments > Edit > Version: New version > Deploy** (the URL stays the same).
Run **BoatMedix > Send a test confirmation to me** to check that info@ receives the test notification.
