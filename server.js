const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const MP = require('./public/shared.js');

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data'), UPLOADS = path.join(__dirname, 'uploads'), DBFILE = path.join(DATA, 'db.json');
[DATA, UPLOADS].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ---------- storage ----------
let db = { cases: [], staff: [] };
if (fs.existsSync(DBFILE)) {
  const raw = JSON.parse(fs.readFileSync(DBFILE, 'utf8'));
  if (Array.isArray(raw)) fs.renameSync(DBFILE, path.join(DATA, 'db.v1-backup.json'));   // old single-portal format
  else db = { cases: (raw.cases || []).map(MP.normalize), staff: raw.staff || [] };
}
(process.env.STAFF_CONTACTS || '').split(',').map(s => s.trim()).filter(Boolean).forEach(c => {
  if (!db.staff.some(s => MP.normContact(s.contact) === MP.normContact(c))) db.staff.push({ id: crypto.randomUUID().slice(0, 8), name: 'Hospital Staff', designation: 'Billing Desk', contact: c });
});
const save = () => fs.writeFileSync(DBFILE, JSON.stringify(db, null, 2));
const pick = (b, keys) => Object.fromEntries(keys.filter(k => k in (b || {})).map(k => [k, b[k]]));
const safe = s => String(s).replace(/[^\w.-]/g, '');

// ---------- sessions (separate cookie per portal) ----------
const sessions = new Map();
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(p => p.trim().split('=')).filter(p => p[0]));
const sessionOf = (req, role) => { const s = sessions.get(cookies(req)[role + '_sid']); return s && s.role === role ? s : null; };
const requireRole = role => (req, res, next) => { const s = sessionOf(req, role); if (!s) return res.status(401).json({ error: 'Please sign in to the ' + role + ' portal.' }); req.user = s; next(); };
const mineOf = req => db.cases.filter(c => MP.normContact(c.contact) === req.user.contact);

// ---------- OTP (no SMS gateway: printed in this terminal) ----------
const otps = new Map();
const issueOtp = key => { const otp = String(crypto.randomInt(1000, 10000)); otps.set(key, { otp, exp: Date.now() + 5 * 60e3, tries: 0 }); console.log(`\n[OTP] ${key} -> ${otp}  (valid 5 min)\n`); };
function checkOtp(key, code) {
  const r = otps.get(key);
  if (!r || r.exp < Date.now()) return 'OTP expired or not requested. Send a new OTP.';
  if (++r.tries > 5) { otps.delete(key); return 'Too many attempts. Send a new OTP.'; }
  if (String(code) !== r.otp) return 'Incorrect OTP.';
  otps.delete(key); return null;
}
const validContact = k => /^[6-9]\d{9}$/.test(k) || /^\S+@\S+\.\S+$/.test(k);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- auth ----------
app.get('/api/auth/staff/status', (req, res) => res.json({ setup: db.staff.length === 0 }));
app.post('/api/auth/:role/send', (req, res) => {
  const { role } = req.params, key = MP.normContact(req.body.contact);
  if (!['staff', 'patient'].includes(role)) return res.status(404).end();
  if (!validContact(key)) return res.status(400).json({ error: 'Enter a valid email or 10-digit mobile number.' });
  if (role === 'staff' && db.staff.length && !db.staff.some(s => MP.normContact(s.contact) === key)) return res.status(403).json({ error: 'This contact is not a registered hospital staff account.' });
  if (role === 'patient' && !db.cases.some(c => MP.normContact(c.contact) === key)) return res.status(403).json({ error: 'No admission found for this contact. Ask the hospital billing desk to register you first.' });
  issueOtp(role + ':' + key); res.json({ ok: true });
});
app.post('/api/auth/:role/verify', (req, res) => {
  const { role } = req.params, key = MP.normContact(req.body.contact);
  if (!['staff', 'patient'].includes(role)) return res.status(404).end();
  const err = checkOtp(role + ':' + key, req.body.otp); if (err) return res.status(400).json({ error: err });
  let name = '';
  if (role === 'staff') {
    let s = db.staff.find(x => MP.normContact(x.contact) === key);
    if (!s) { if (db.staff.length) return res.status(403).json({ error: 'Not registered.' }); s = { id: crypto.randomUUID().slice(0, 8), name: 'Hospital Admin', designation: 'Administrator (first sign-in)', contact: String(req.body.contact).trim() }; db.staff.push(s); save(); }
    name = s.name;
  }
  const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, { role, contact: key, name });
  res.setHeader('Set-Cookie', `${role}_sid=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800`);
  res.json({ ok: true, contact: key, name });
});
app.get('/api/auth/:role/me', (req, res) => { const s = sessionOf(req, req.params.role); s ? res.json({ contact: s.contact, name: s.name }) : res.status(401).json({ error: 'Not signed in' }); });
app.post('/api/auth/:role/logout', (req, res) => { sessions.delete(cookies(req)[req.params.role + '_sid']); res.setHeader('Set-Cookie', `${req.params.role}_sid=; Path=/; Max-Age=0`); res.json({ ok: true }); });

// ---------- uploads ----------
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const uploader = slots => multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => { const d = path.join(UPLOADS, safe(req.params.id)); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, f, cb) => cb(null, `${req.params.slot}-${Date.now()}${path.extname(f.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, TYPES.includes(f.mimetype) && slots.includes(req.params.slot))
}).single('file');
function attach(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Upload a PDF, JPG or PNG (max 10 MB) for a valid document slot.' });
  const old = req.c.files[req.params.slot]; if (old) try { fs.unlinkSync(path.join(UPLOADS, safe(req.c.id), path.basename(old.url))); } catch (_) {}
  req.c.files[req.params.slot] = { name: req.file.originalname, size: req.file.size, type: req.file.mimetype, url: `/files/${safe(req.c.id)}/${req.file.filename}`, at: Date.now() };
  save(); res.json({ file: req.c.files[req.params.slot] });
}
function dropFile(req, res) {
  const f = req.c.files[req.params.slot];
  if (f) { try { fs.unlinkSync(path.join(UPLOADS, safe(req.c.id), path.basename(f.url))); } catch (_) {} delete req.c.files[req.params.slot]; save(); }
  res.json({ ok: true });
}
// Authorized document download: staff can open any case; a patient only their own
app.get('/files/:id/:name', (req, res) => {
  const c = db.cases.find(x => x.id === req.params.id), st = sessionOf(req, 'staff'), pt = sessionOf(req, 'patient');
  if (!c || !(st || (pt && MP.normContact(c.contact) === pt.contact))) return res.status(401).send('Not authorized');
  res.sendFile(path.join(UPLOADS, safe(req.params.id), path.basename(req.params.name)));
});

// ---------- STAFF portal API ----------
const staff = express.Router(); staff.use(requireRole('staff'));
const findStaffCase = (req, res, next) => { req.c = db.cases.find(x => x.id === req.params.id); req.c ? next() : res.status(404).json({ error: 'Case not found' }); };
const HOSPITAL = ['name', 'contact', 'uhid', 'claimId', 'bed', 'domain', 'customDomain'];
staff.get('/cases', (req, res) => res.json(db.cases));
staff.get('/staff', (req, res) => res.json(db.staff));
staff.post('/staff', (req, res) => {
  const { name, designation, contact } = req.body, key = MP.normContact(contact);
  if (!String(name || '').trim() || !validContact(key)) return res.status(400).json({ error: 'Enter the staff name and a valid email / 10-digit mobile.' });
  if (db.staff.some(s => MP.normContact(s.contact) === key)) return res.status(409).json({ error: 'This contact is already registered.' });
  const s = { id: crypto.randomUUID().slice(0, 8), name: name.trim(), designation: String(designation || '').trim() || 'Billing Desk', contact: String(contact).trim() };
  db.staff.push(s); save(); res.status(201).json(s);
});
staff.delete('/staff/:id', (req, res) => {
  const s = db.staff.find(x => x.id === req.params.id); if (!s) return res.status(404).json({ error: 'Not found' });
  if (db.staff.length === 1) return res.status(400).json({ error: 'At least one staff account must remain.' });
  db.staff = db.staff.filter(x => x !== s); save(); res.json({ ok: true });
});
staff.post('/cases', (req, res) => {
  const b = pick(req.body, HOSPITAL);
  if (!String(b.name || '').trim() || !validContact(MP.normContact(b.contact))) return res.status(400).json({ error: 'Patient name and a valid mobile / email (used for patient sign-in) are required.' });
  const c = MP.blankCase({ id: crypto.randomUUID().slice(0, 8), createdAt: Date.now(), ...b }); db.cases.push(c); save(); res.status(201).json(c);
});
staff.put('/cases/:id', findStaffCase, (req, res) => {
  const locked = req.c.status !== 'registered';
  if (locked && ('bill' in req.body || 'contact' in req.body)) return res.status(409).json({ error: 'Bill and patient contact are locked once the patient has approved a financing plan.' });
  Object.assign(req.c, pick(req.body, HOSPITAL)); if ('bill' in req.body) req.c.bill = Object.assign(req.c.bill, req.body.bill);
  save(); res.json(req.c);
});
staff.delete('/cases/:id', findStaffCase, (req, res) => { db.cases = db.cases.filter(x => x !== req.c); fs.rmSync(path.join(UPLOADS, safe(req.c.id)), { recursive: true, force: true }); save(); res.json({ ok: true }); });
staff.post('/cases/:id/files/:slot', findStaffCase, (req, res, next) => { if (req.c.status !== 'registered') return res.status(409).json({ error: 'Documents are locked after the patient approved a plan.' }); next(); }, (req, res) => uploader(['tpa', 'bill'])(req, res, e => (e ? res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'File exceeds 10 MB' : e.message }) : attach(req, res))));
staff.delete('/cases/:id/files/:slot', findStaffCase, (req, res) => (req.c.status !== 'registered' ? res.status(409).json({ error: 'Locked.' }) : dropFile(req, res)));
staff.post('/cases/:id/release', findStaffCase, (req, res) => {
  if (req.c.status !== 'disbursed') return res.status(409).json({ error: 'The patient must complete the e-sign OTP (Step 3) before the bed can be released.' });
  req.c.status = 'discharged'; req.c.dischargedAt = Date.now(); req.c.gatePass = `GP-${req.c.id.toUpperCase()}-${crypto.randomInt(1000, 10000)}`; save(); res.json(req.c);
});
app.use('/api/staff', staff);

// ---------- PATIENT portal API ----------
const patient = express.Router(); patient.use(requireRole('patient'));
const findOwn = (req, res, next) => { req.c = mineOf(req).find(x => x.id === req.params.id); req.c ? next() : res.status(404).json({ error: 'Case not found' }); };
const editable = (req, res, next) => (req.c.status === 'registered' ? next() : res.status(409).json({ error: 'Verification is locked after you approved a financing plan.' }));
patient.get('/cases', (req, res) => res.json(mineOf(req)));
patient.put('/cases/:id', findOwn, editable, (req, res) => {
  const b = pick(req.body, ['category', 'pan', 'aadhaar', 'score', 'nominee']);
  if (b.category && !MP.CATS[b.category]) return res.status(400).json({ error: 'Invalid classification' });
  if (b.aadhaar && !/^XXXX-XXXX-\d{4}$/.test(b.aadhaar)) b.aadhaar = '';         // raw Aadhaar numbers are never stored
  if (b.nominee) b.nominee = Object.assign(req.c.nominee, pick(b.nominee, ['name', 'relation', 'pan', 'score']));
  Object.assign(req.c, b); save(); res.json(req.c);
});
patient.post('/cases/:id/files/:slot', findOwn, editable, (req, res) => uploader(['kyc', 'categoryDoc', 'nomineeDoc'])(req, res, e => (e ? res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'File exceeds 10 MB' : e.message }) : attach(req, res))));
patient.delete('/cases/:id/files/:slot', findOwn, editable, dropFile);
patient.post('/cases/:id/approve', findOwn, editable, (req, res) => {
  const s = MP.steps(req.c);
  if (!s.done[0]) return res.status(409).json({ error: 'The hospital has not published your bill and TPA letter yet.' });
  if (!s.done[1]) return res.status(409).json({ error: 'Complete Step 1 verification first.' });
  if (![1, 2, 3].includes(+req.body.plan)) return res.status(400).json({ error: 'Choose a plan.' });
  req.c.plan = +req.body.plan; req.c.status = 'plan_approved'; req.c.approvedAt = Date.now(); save(); res.json(req.c);
});
patient.post('/cases/:id/esign/send', findOwn, (req, res) => { if (req.c.status !== 'plan_approved') return res.status(409).json({ error: 'Approve a plan in Step 2 first.' }); issueOtp('esign:' + req.c.id + ':' + req.user.contact); res.json({ ok: true }); });
patient.post('/cases/:id/esign/confirm', findOwn, (req, res) => {
  if (req.c.status !== 'plan_approved') return res.status(409).json({ error: 'Nothing to confirm.' });
  const err = checkOtp('esign:' + req.c.id + ':' + req.user.contact, req.body.otp); if (err) return res.status(400).json({ error: err });
  req.c.status = 'disbursed'; req.c.disbursedAt = Date.now(); save(); res.json(req.c);
});
app.use('/api/patient', patient);

app.use((err, req, res, next) => res.status(400).json({ error: err.message }));
{PORT}\n  Staff portal:   http://localhost:${PORT}/staff/\n  Patient portal: http://localhost:${PORT}/patient/`));
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3006;
  app.listen(PORT, () => {
    console.log(`MedPay Instant running at http://localhost:${PORT}`);
    console.log(`  Staff portal:   http://localhost:${PORT}/staff/`);
    console.log(`  Patient portal: http://localhost:${PORT}/patient/`);
  });
}

module.exports = app;