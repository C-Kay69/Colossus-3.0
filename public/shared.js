/* Business rules shared by the server (require) and both portals (script tag). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MP = factory(); })(this, function () {
  const MIN_SCORE = 680;
  const PANRE = /^[A-Z]{5}[0-9]{4}[A-Z]$/, AADHAAR_MASKED = /^XXXX-XXXX-\d{4}$/;
  const CATS = { employed: '1. Employed (Salaried)', businessman: '2. Businessman', unemployed: '3. Unemployed', senior: '4. Senior Citizen (60+)' };
  const DOMAINS = [
    ['accidental', 'Emergency & Accidental', '24/7 ER & Motor Trauma', 'critical', 'Code Red', '#e11d48', 'Code Red Priority • 15m SLA'],
    ['trauma', 'Trauma & Critical Care', 'Neuro & Polytrauma Unit', 'critical', 'ICU', '#d97706', 'ICU Critical Track • 20m SLA'],
    ['organ', 'Organ Transplant & Renal', 'Liver, Kidney & Heart', 'surgical', 'Nephrology', '#059669', 'Transplant Desk • Instant Approval'],
    ['cardiac', 'Cardiac & Vascular', 'Angioplasty & Bypass', 'surgical', 'Cath Lab', '#dc2626', 'Cath Lab Priority • 20m SLA'],
    ['oncology', 'Oncology & Cancer Care', 'Radiation & Surgical Onco', 'specialized', 'Chemo', '#9333ea', 'Oncology Care • Instant Approval'],
    ['orthopedics', 'Orthopedics & Joints', 'Arthroscopy & Implants', 'surgical', 'Spine', '#0284c7', 'Surgical Implant Track • 25m SLA'],
    ['neuro', 'Neurosciences & Stroke', 'Brain & Spine Surgery', 'critical', 'Neuro', '#4f46e5', 'Stroke Unit Priority • 15m SLA'],
    ['maternity', 'Maternity, NICU & Peds', 'Neonatal & Child Care', 'specialized', 'OB-GYN', '#db2777', 'Family Care Track • Instant Approval'],
    ['gastro', 'Gastro & Hepatology', 'Laparoscopic GI Unit', 'surgical', 'Endoscopy', '#0d9488', 'GI Surgical Track • 25m SLA'],
    ['others', 'General Med & Others', 'Multi-Specialty Ward', 'specialized', 'Internal Med', '#57534e', 'Instant Approval • < 30m SLA']
  ].map(([key, label, sub, cat, tag, color, sla]) => ({ key, label, sub, cat, tag, color, sla }));

  const num = v => +v || 0;
  const normContact = s => { s = String(s || '').trim().toLowerCase(); const d = s.replace(/[\s-]/g, '').replace(/^\+91/, ''); return /^\d+$/.test(d) ? d : s; };
  const maskAadhaar = raw => { const d = String(raw || '').replace(/\D/g, ''); return d.length === 12 ? 'XXXX-XXXX-' + d.slice(-4) : ''; };
  const gapOf = c => Math.max(0, num(c.bill.total) - num(c.bill.tpa));
  const dedSum = c => c.bill.deductions.reduce((s, d) => s + num(d.amt), 0);
  const needNominee = c => c.category === 'senior' || !(num(c.score) >= MIN_SCORE);
  const domLabel = c => (c.domain === 'others' && (c.customDomain || '').trim()) || (DOMAINS.find(d => d.key === c.domain) || {}).label || 'Not assigned';

  function blankCase(f = {}) {
    return Object.assign({ status: 'registered', name: '', contact: '', uhid: '', claimId: '', bed: '', domain: '', customDomain: '',
      category: '', pan: '', aadhaar: '', score: '', plan: 1, files: {}, nominee: { name: '', relation: '', pan: '', score: '' },
      bill: { total: '', tpa: '', deductions: [] } }, f);
  }
  function normalize(c) {   // make sure stored/old records always have every field
    const b = blankCase(); Object.keys(b).forEach(k => { if (c[k] === undefined) c[k] = b[k]; });
    c.nominee = Object.assign(b.nominee, c.nominee); c.bill = Object.assign({ total: '', tpa: '' }, c.bill); c.bill.deductions = c.bill.deductions || []; return c;
  }
  function catDoc(c) {
    return { employed: ['Salary Slip & Form-16', 'latest salary slip / Form-16'], businessman: ['GST Certificate & ITR', 'GST certificate and last 2 years ITR'],
      unemployed: ['Bank Statement (6 months)', '6-month savings account statement'], senior: ['Age & Pension Proof', 'PPO / senior citizen card'] }[c.category] || ['Income / Category Proof', 'category proof'];
  }
  function checks(c) {
    const L = [
      { k: 'kyc', t: 'Patient PAN & Aadhaar e-KYC', slot: 'kyc', need: [[!!CATS[c.category], 'select your borrower classification'], [PANRE.test((c.pan || '').toUpperCase()), 'enter a valid PAN'],
        [AADHAAR_MASKED.test(c.aadhaar || ''), 'enter your 12-digit Aadhaar'], [!!c.files.kyc, 'upload PAN & Aadhaar e-KYC document']] },
      { k: 'cat', t: catDoc(c)[0], slot: 'categoryDoc', need: [[!!c.files.categoryDoc, 'upload ' + catDoc(c)[1]]] }
    ];
    if (needNominee(c)) L.push({ k: 'nominee', t: 'Nominee PAN, Aadhaar & Credit Proof', slot: 'nomineeDoc', need: [
      [!!c.nominee.name.trim(), 'enter nominee name'], [PANRE.test((c.nominee.pan || '').toUpperCase()), 'enter nominee PAN'],
      [num(c.nominee.score) >= MIN_SCORE, `nominee credit score must be ${MIN_SCORE}+`], [!!c.files.nomineeDoc, 'upload nominee KYC']] });
    L.forEach(x => { x.missing = x.need.filter(n => !n[0]).map(n => n[1]); x.ok = !x.missing.length; });
    return L;
  }
  const verified = c => checks(c).every(x => x.ok);
  const billReady = c => !!(c.files.tpa && c.files.bill) && gapOf(c) > 0;
  const APPROVED = ['plan_approved', 'disbursed', 'discharged'];
  function steps(c) { const done = [billReady(c), verified(c), APPROVED.includes(c.status), c.status === 'discharged']; return { done, cur: done.indexOf(false) }; }
  function plans(c) {
    const g = gapOf(c), r = 0.10 / 12, up = Math.round(g * 0.25), emi = g ? g * r / (1 - Math.pow(1 + r, -12)) : 0;
    return [
      { id: 1, name: '0% Interest Split (Pay in 3)', desc: '3 equal monthly installments • Zero processing fee', amt: g / 3, per: '/ month × 3', sum: '0% Interest Split (Pay in 3)' },
      { id: 2, name: 'Flexible Tenure EMI (12 Months)', desc: 'No down payment today • 10% p.a. reducing rate', amt: emi, per: '/ month × 12', sum: 'Flexible Tenure EMI (12 Months)' },
      { id: 3, name: 'Split-Pay (25% UPI Now + 75% 0% Credit)', desc: `Pay ${up.toLocaleString('en-IN')} via UPI now • Finance the rest over 3 months`, amt: (g - up) / 3, per: '/ mo after UPI', sum: 'Split-Pay (25% UPI + 75% over 3 months)' }
    ];
  }
  function basis(c) {
    if (!verified(c)) return 'Pending patient verification';
    return needNominee(c) ? `Nominee credit (${c.nominee.name} • score ${c.nominee.score})` : `Self credit (PAN ${c.pan.toUpperCase()} • score ${c.score})`;
  }
  return { MIN_SCORE, PANRE, CATS, DOMAINS, normContact, maskAadhaar, gapOf, dedSum, needNominee, domLabel, blankCase, normalize, catDoc, checks, verified, billReady, steps, plans, basis };
});
