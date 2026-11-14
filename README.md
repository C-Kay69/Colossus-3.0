# MedPay Instant: separate Staff and Patient portals (Node.js + Tailwind CSS)

    npm install
    npm start        # builds Tailwind CSS, then serves http://localhost:3008

| URL | Portal |
|---|---|
| http://localhost:3008/ | Landing page (choose a portal) |
| http://localhost:3008/staff/ | Hospital Staff Portal |
| http://localhost:3008/patient/ | Patient Portal |

## How it works
1. **Staff sign in first.** The very first person to sign in at `/staff/` becomes the hospital admin and can add other staff accounts.
2. **Patients can create their own login** at `/patient/` with their name and mobile/email, verified by OTP. Logins are stored and appear automatically in the staff portal's Patient Login Master Directory. Staff may also register an inpatient; this creates a login if one does not already exist for that contact.
3. **The patient signs in at `/patient/`** with the verified mobile/email, completes Step 1 (KYC and credit documents), picks a plan in Step 2 and confirms the e-sign OTP in Step 3. If an admission is not linked yet, the patient can still sign in and the portal will show when one is added for that contact.
4. **Staff release the bed**, which issues the gate pass the patient sees.

Each portal has its own sign-in session. All permissions are enforced by the server, not just hidden in the page.

## Notes
- No SMS/email gateway: every OTP is printed in the terminal running the server.
- Patient logins are passwordless and use the registered email/mobile plus an OTP; no passwords or OTPs are stored in the database.
- Data is in `data/db.json`; uploads are in `uploads/<caseId>/` (PDF/JPG/PNG, max 10 MB) and are only served to signed-in users.
- Aadhaar numbers are masked in the browser; only the last 4 digits are ever sent or stored.
- `STAFF_CONTACTS=a@hosp.org,9876543210 npm start` pre-registers staff accounts.
- A `data/db.json` from the earlier single-portal version is moved to `data/db.v1-backup.json` automatically.
- Development: `npm run dev`.
