# MedPay Instant: separate Staff and Patient portals (Node.js + Tailwind CSS)

    npm install
    npm start        # builds Tailwind CSS, then serves http://localhost:3000

| URL | Portal |
|---|---|
| http://localhost:3000/ | Landing page (choose a portal) |
| http://localhost:3000/staff/ | Hospital Staff Portal |
| http://localhost:3000/patient/ | Patient Portal |

## How it works
1. **Staff sign in first.** The very first person to sign in at `/staff/` becomes the hospital admin and can add other staff accounts.
2. **Staff register an inpatient** (name, mobile/email, UHID, claim ID, bed), assign the department, upload the TPA letter and final bill, and enter the bill / TPA amounts.
3. **The patient signs in at `/patient/`** with the mobile/email the hospital registered, completes Step 1 (KYC and credit documents), picks a plan in Step 2 and confirms the e-sign OTP in Step 3.
4. **Staff release the bed**, which issues the gate pass the patient sees.

Each portal has its own sign-in session. All permissions are enforced by the server, not just hidden in the page.

## Notes
- No SMS/email gateway: every OTP is printed in the terminal running the server.
- Data is in `data/db.json`; uploads are in `uploads/<caseId>/` (PDF/JPG/PNG, max 10 MB) and are only served to signed-in users.
- Aadhaar numbers are masked in the browser; only the last 4 digits are ever sent or stored.
- `STAFF_CONTACTS=a@hosp.org,9876543210 npm start` pre-registers staff accounts.
- A `data/db.json` from the earlier single-portal version is moved to `data/db.v1-backup.json` automatically.
- Development: `npm run dev`.
