/* Hospital Staff Portal: registry, billing audit, document publishing, bed release. */
const T = { cases: [], staff: [], patients: [], id: null, tab: 'dir', filter: 'all', q: '', user: null };
const cur = () => T.cases.find(c => c.id === T.id);
const dom = c => MP.DOMAINS.find(d => d.key === c.domain);
document.body.insertAdjacentHTML('beforeend', DOC_MODAL);
$('docModal').addEventListener('click', e => e.target === $('docModal') && closeDoc());

const login = mountLogin({ role: 'staff', title: 'Hospital billing &amp; discharge desk', blurb: 'Register inpatients, publish TPA letters and bills, audit patient credit dossiers and release beds.',
  side: 'bg-gradient-to-br from-stone-800 to-stone-950', placeholder: 'staff email or 98XXXXXXXX', onSuccess: r => start(r) });
window.onSignedOut = () => signOut(true);
async function showLogin() { let note = ''; try { if ((await api('/api/auth/staff/status')).setup) note = 'First-time setup: no staff accounts exist yet. The first person to sign in becomes the hospital administrator and can then add other staff.'; } catch (_) {} login.show(note); }
async function signOut(silent) { try { await api('/api/auth/staff/logout', jsonOpts('POST')); } catch (_) {} T.cases = []; T.id = null; showLogin(); if (!silent) toast('Signed out'); }
async function start(user) {
  T.user = user; $('who').textContent = `${user.name} • ${user.contact}`;
  await Promise.all([api('/api/staff/cases').then(r => (T.cases = r.map(MP.normalize))), api('/api/staff/staff').then(r => (T.staff = r)), api('/api/staff/patients').then(r => (T.patients = r))]).catch(fail);
  T.id = T.cases[0]?.id || null; setTab('dir');
}
api('/api/auth/staff/me').then(start).catch(showLogin);

// ---------- tabs ----------
function setTab(t) {
  T.tab = t; $('tabDir').classList.toggle('hidden', t !== 'dir'); $('tabAudit').classList.toggle('hidden', t !== 'audit');
  const on = 'px-3 py-1.5 rounded-lg bg-stone-900 text-white shadow-sm cursor-pointer', off = 'px-3 py-1.5 rounded-lg text-stone-600 hover:text-stone-900 cursor-pointer';
  $('tabBtnDir').className = t === 'dir' ? on : off; $('tabBtnAudit').className = t === 'audit' ? on : off;
  t === 'dir' ? renderDir() : renderAudit();
}
function inspect(id) { T.id = id; setTab('audit'); window.scrollTo({ top: 0 }); }

// ---------- directory ----------
function stage(c) {
  const p = (cls, t) => `<span class="tag rounded-full ${cls}">${t}</span>`;
  if (c.status === 'discharged') return p('bg-emerald-600 text-white', '✓ Discharged &amp; settled');
  if (c.status === 'disbursed') return p('bg-sky-100 text-sky-800', 'Awaiting bed release');
  if (c.status === 'plan_approved') return p('bg-sky-100 text-sky-800', 'Awaiting patient e-sign OTP');
  return MP.verified(c) ? p('bg-emerald-100 text-emerald-800', '✓ Credit verified') : p('bg-amber-100 text-amber-800', '⏳ Pending patient KYC');
}
function renderDir() {
  const L = T.cases, gross = L.reduce((s, c) => s + (+c.bill.total || 0), 0), tpa = L.reduce((s, c) => s + (+c.bill.tpa || 0), 0), gap = L.reduce((s, c) => s + MP.gapOf(c), 0);
  const kpi = (l, v, s) => `<div class="card !p-4"><p class="text-[11px] font-semibold uppercase tracking-wider text-stone-400">${l}</p><p class="text-xl font-extrabold mt-1">${v}</p><p class="text-[11px] text-stone-500">${s}</p></div>`;
  $('kpis').innerHTML = kpi('Registered discharge queue', L.length + ' inpatients', `${L.filter(c => c.status === 'discharged').length} discharged`) + kpi('Gross hospital bills', inr(gross), 'TPA approved: ' + inr(tpa)) +
    kpi('Total co-pay gap financing', inr(gap), 'Under RBI digital lending rules') + kpi('Credit verified', `${L.filter(c => MP.verified(c)).length} / ${L.length} patients`, 'Patients complete KYC in their own portal');
  $('patientTable').innerHTML = `<table class="w-full text-left text-xs"><thead><tr class="bg-stone-200/60 text-stone-600"><th class="p-3">Patient</th><th class="p-3">Ward / department</th><th class="p-3">Borrower type</th><th class="p-3">Underwriting basis</th><th class="p-3 text-right">Gross / TPA / Gap</th><th class="p-3 text-center">Status</th><th class="p-3 text-right">Actions</th></tr></thead>
    <tbody class="divide-y divide-stone-300/70">${L.map(c => `<tr class="${c.id === T.id ? 'bg-emerald-50/60' : 'hover:bg-white/50'}"><td class="p-3"><p class="font-bold">${esc(c.name)}</p><p class="text-[11px] text-stone-500">${esc(c.uhid) || 'UHID —'} • ${esc(c.contact)}</p></td>
      <td class="p-3"><p class="font-semibold">${c.bed ? 'Bed ' + esc(c.bed) : '—'}</p><p class="text-[11px] text-stone-500">${esc(MP.domLabel(c))}</p></td><td class="p-3">${MP.CATS[c.category] || '<span class="text-stone-400">Not submitted</span>'}</td>
      <td class="p-3">${esc(MP.basis(c))}<p class="text-[11px] text-stone-500">Claim: ${esc(c.claimId) || '—'}</p></td><td class="p-3 text-right"><p class="text-[11px] text-stone-500">${inr(c.bill.total)} | ${inr(c.bill.tpa)}</p><p class="text-sm font-extrabold">${inr(MP.gapOf(c))}</p></td>
      <td class="p-3 text-center">${stage(c)}${MP.billReady(c) ? '' : '<p class="text-[10px] text-amber-700 mt-1">Bill / TPA not published</p>'}</td>
      <td class="p-3 text-right whitespace-nowrap"><button class="btn-dark" onclick="inspect('${c.id}')">Inspect &amp; Audit</button> <button class="text-[11px] text-rose-600 underline cursor-pointer ml-1" onclick="delCase('${c.id}')">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="p-6 text-center text-stone-500">No inpatients registered yet.</td></tr>'}</tbody></table>`;
  $('loginPatientTable').innerHTML = `<table class="w-full text-left text-xs"><thead><tr class="bg-stone-200/60 text-stone-600"><th class="p-3">Patient name</th><th class="p-3">Login email / mobile</th><th class="p-3">Admission</th><th class="p-3">Login created</th></tr></thead>
    <tbody class="divide-y divide-stone-300/70">${T.patients.map(p => {
      const admitted = T.cases.some(c => MP.normContact(c.contact) === MP.normContact(p.contact));
      return `<tr><td class="p-3 font-bold">${esc(p.name)}</td><td class="p-3 font-mono">${esc(p.contact)}</td><td class="p-3">${admitted ? '<span class="tag bg-emerald-100 text-emerald-800">Admission linked</span>' : '<span class="tag bg-amber-100 text-amber-800">Awaiting admission</span>'}</td><td class="p-3">${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="p-6 text-center text-stone-500">No patient logins created yet.</td></tr>'}</tbody></table>`;
  $('staffTable').innerHTML = `<table class="w-full text-left text-xs"><thead><tr class="bg-stone-200/60 text-stone-600"><th class="p-3">Staff name</th><th class="p-3">Designation &amp; desk</th><th class="p-3">Registered email / mobile</th><th class="p-3">Access</th><th class="p-3"></th></tr></thead>
    <tbody class="divide-y divide-stone-300/70">${T.staff.map(s => `<tr><td class="p-3 font-bold">${esc(s.name)}</td><td class="p-3">${esc(s.designation)}</td><td class="p-3 font-mono">${esc(s.contact)}</td><td class="p-3"><span class="tag bg-emerald-100 text-emerald-800">Full hospital master DB access</span></td><td class="p-3 text-right"><button class="text-[11px] text-rose-600 underline cursor-pointer" onclick="delStaff('${s.id}')">Remove</button></td></tr>`).join('')}</tbody></table>`;
}
async function registerPatient() {
  const v = id => $(id).value.trim();
  try { const c = MP.normalize(await api('/api/staff/cases', jsonOpts('POST', { name: v('rName'), contact: v('rContact'), uhid: v('rUhid'), claimId: v('rClaim'), bed: v('rBed') })));
    T.cases.push(c); T.patients = await api('/api/staff/patients'); ['rName', 'rContact', 'rUhid', 'rClaim', 'rBed'].forEach(i => ($(i).value = '')); toast('Inpatient registered. A patient login is available for this contact.'); renderDir(); inspect(c.id); } catch (e) { fail(e); }
}
async function delCase(id) { if (!confirm('Delete this inpatient record and all documents?')) return; try { await api('/api/staff/cases/' + id, { method: 'DELETE' }); T.cases = T.cases.filter(c => c.id !== id); if (T.id === id) T.id = T.cases[0]?.id || null; renderDir(); } catch (e) { fail(e); } }
async function addStaff() {
  try { T.staff.push(await api('/api/staff/staff', jsonOpts('POST', { name: $('sName').value, designation: $('sDesig').value, contact: $('sContact').value }))); ['sName', 'sDesig', 'sContact'].forEach(i => ($(i).value = '')); renderDir(); } catch (e) { fail(e); }
}
async function delStaff(id) { if (!confirm('Remove this staff account?')) return; try { await api('/api/staff/staff/' + id, { method: 'DELETE' }); T.staff = T.staff.filter(s => s.id !== id); renderDir(); } catch (e) { fail(e); } }

// ---------- audit ----------
const timers = {};
function setField(path, val) {
  const c = cur(); if (!c) return; const p = path.split('.'), last = p.pop(); let o = c; p.forEach(k => (o = o[k])); o[last] = val;
  clearTimeout(timers[c.id]); timers[c.id] = setTimeout(() => api('/api/staff/cases/' + c.id, jsonOpts('PUT', { name: c.name, uhid: c.uhid, claimId: c.claimId, bed: c.bed, domain: c.domain, customDomain: c.customDomain, ...(c.status === 'registered' ? { contact: c.contact, bill: c.bill } : {}) })).catch(e => { toast(e.message, true); }), 450);
  liveAudit();
}
function renderAudit() {
  const c = cur();
  if (!c) { $('tabAudit').innerHTML = '<div class="card text-center text-sm text-stone-600 py-10">No inpatient selected. Register or inspect a patient from the first tab.</div>'; return; }
  const locked = c.status !== 'registered', f = (l, k, v, extra = '') => `<div><label class="lbl">${l}</label><input class="inp" value="${esc(v)}" ${extra} oninput="setField('${k}',this.value)"></div>`;
  $('tabAudit').innerHTML = `<div class="card space-y-4"><div id="aSummary"></div><div id="aActions" class="flex flex-wrap items-center gap-3 border-t border-stone-300/70 pt-4"></div></div>
    <div class="card"><h3 class="text-sm font-bold mb-3">Patient &amp; Admission Details</h3><div class="grid grid-cols-1 sm:grid-cols-5 gap-3">${f('Patient name', 'name', c.name)}${f('Patient mobile / email (sign-in)', 'contact', c.contact, locked ? 'disabled' : '')}${f('UHID', 'uhid', c.uhid)}${f('Claim ID', 'claimId', c.claimId)}${f('Ward / bed', 'bed', c.bed)}</div></div>
    <div class="card space-y-4"><div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3"><div><h2 class="text-xs font-bold uppercase tracking-wider text-stone-700">Hospital Facility Clinical Domains (10 Covered Specialties)</h2><p class="text-xs text-stone-500">Assign or update the admitting department &amp; discharge SLA</p></div>
      <div class="flex flex-wrap gap-2"><div id="domFilters" class="flex gap-1 bg-stone-200/70 p-1 rounded-xl border border-stone-300 text-[11px] font-semibold"></div><input class="inp !w-44 !rounded-xl" placeholder="Filter department..." value="${esc(T.q)}" oninput="T.q=this.value.toLowerCase().trim();renderDomains()"></div></div>
      <div id="domGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5"></div>
      <div id="customBar" class="hidden flex items-center gap-2 pt-2 border-t border-stone-300/70"><span class="text-xs font-semibold whitespace-nowrap">Specify specialty / ward:</span><input class="inp max-w-md" value="${esc(c.customDomain)}" placeholder="e.g. Pulmonology, Urology, ENT" oninput="setField('customDomain',this.value)"></div></div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card space-y-3"><h3 class="text-sm font-bold">Hospital Bill &amp; TPA Documents (published to the patient)</h3>${locked ? '<p class="text-[11px] text-amber-700">Locked: the patient has approved a financing plan.</p>' : ''}
        ${slotRow(c, 'tpa', 'Insurance (TPA) Approval Letter', 'Upload TPA final authorization', { editable: !locked })}${slotRow(c, 'bill', 'Final Hospital Bill', 'Upload itemized discharge bill', { editable: !locked })}
        <div class="grid grid-cols-2 gap-3"><div><label class="lbl">Total hospital bill (₹)</label><input class="inp" type="number" min="0" ${locked ? 'disabled' : ''} value="${esc(c.bill.total)}" oninput="setField('bill.total',this.value)"></div>
        <div><label class="lbl">Insurance approved by TPA (₹)</label><input class="inp" type="number" min="0" ${locked ? 'disabled' : ''} value="${esc(c.bill.tpa)}" oninput="setField('bill.tpa',this.value)"></div></div>
        <div><div class="flex items-center justify-between"><label class="lbl !mb-0">Itemized non-payable deductions</label>${locked ? '' : '<button class="text-[11px] font-semibold text-brand underline cursor-pointer" onclick="addDed()">+ Add item</button>'}</div>
        <div class="space-y-1.5 mt-1.5">${c.bill.deductions.map((d, i) => `<div class="flex gap-1.5"><input class="inp" placeholder="Reason (e.g. room rent cap)" ${locked ? 'disabled' : ''} value="${esc(d.label)}" oninput="setDed(${i},'label',this.value)"><input class="inp !w-28" type="number" min="0" placeholder="₹" ${locked ? 'disabled' : ''} value="${esc(d.amt)}" oninput="setDed(${i},'amt',this.value)">${locked ? '' : `<button class="text-rose-600 px-1 cursor-pointer" onclick="delDed(${i})">✕</button>`}</div>`).join('') || '<p class="text-[11px] text-stone-500">Optional itemization.</p>'}</div></div>
        <div id="aRecon"></div></div>
      <div class="card space-y-3"><h3 class="text-sm font-bold">Patient Submitted KYC &amp; Credit Dossier (read-only)</h3><div id="aDossier" class="space-y-2 text-xs"></div></div></div>`;
  renderDomains(); liveAudit();
}
function liveAudit() {
  const c = cur(); if (!c || !$('aSummary')) return;
  const cell = (l, v) => `<div><p class="text-[11px] font-semibold uppercase tracking-wider text-stone-400">${l}</p><div class="mt-1 text-sm">${v}</div></div>`;
  $('aSummary').innerHTML = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-4">${cell('Selected patient', `<b>${esc(c.name)}</b><p class="text-[11px] text-stone-500">${esc(c.contact)}</p>`)}${cell('Borrower category', `<span class="tag bg-emerald-100 text-emerald-800">${MP.CATS[c.category] || 'Not yet submitted'}</span>`)}
    ${cell('Credit / nominee dossier', `<b class="text-xs">${esc(MP.basis(c))}</b>`)}${cell('Claim & net gap', `${esc(c.claimId) || '—'} • <b>${inr(MP.gapOf(c))}</b>`)}${cell('Bed release status', c.status === 'discharged' ? `<b class="text-emerald-600">Bed ${esc(c.bed) || '—'} • Gate pass issued</b>` : `<b class="text-amber-600">Bed ${esc(c.bed) || '—'} • Discharge hold</b>`)}</div>`;
  const ready = c.status === 'disbursed', done = c.status === 'discharged';
  const hint = done ? `Gate pass ${esc(c.gatePass)}` : ready ? '' : { registered: 'Waiting for the patient to verify KYC, choose a plan and confirm the e-sign OTP.', plan_approved: 'Plan approved. Waiting for the patient e-sign OTP.' }[c.status];
  $('aActions').innerHTML = `<button class="btn-ghost" ${c.files.tpa ? '' : 'disabled'} onclick="openDoc('tpa')">📄 View TPA PDF</button><button class="btn-ghost" ${c.files.bill ? '' : 'disabled'} onclick="openDoc('bill')">🧾 View Hospital Bill</button>
    <button class="btn ${done ? '!bg-emerald-700' : ''}" ${ready ? '' : 'disabled'} onclick="release()">${done ? '✓ Settled & gate pass released' : `Approve ${inr(MP.gapOf(c))} settlement & release bed`}</button><span class="text-[11px] text-stone-500">${hint || ''}</span>`;
  const g = MP.gapOf(c), d = MP.dedSum(c), pct = a => (g ? Math.round((+a || 0) / g * 100) : 0);
  $('aRecon').innerHTML = `<div class="rounded-xl bg-white/60 border border-stone-300 p-3 text-xs space-y-1.5"><div class="flex justify-between"><span>Gross inpatient hospital bill</span><b>${inr(c.bill.total)}</b></div><div class="flex justify-between"><span>Cashless TPA approved payout</span><b class="text-emerald-700">- ${inr(c.bill.tpa)}</b></div>
    ${c.bill.deductions.map(x => `<div class="flex justify-between text-stone-500"><span>${esc(x.label) || 'Deduction'}</span><span>${inr(x.amt)} (${pct(x.amt)}% of gap)</span></div>`).join('')}
    <div class="flex justify-between border-t border-stone-300 pt-1.5"><span class="font-semibold">Disallowed co-pay gap (financed via MedPay)</span><b>${inr(g)}</b></div></div>
    ${(+c.bill.tpa || 0) > (+c.bill.total || 0) ? '<p class="text-[11px] text-rose-600 mt-1">TPA amount exceeds the bill. Please re-check.</p>' : ''}${d && d !== g ? `<p class="text-[11px] text-amber-700 mt-1">Itemized deductions (${inr(d)}) do not match the gap (${inr(g)}).</p>` : ''}`;
  const row = (l, v) => `<div class="p-3 rounded-xl bg-white/60 border border-stone-300 flex justify-between gap-3"><span class="text-stone-500">${l}</span><span class="font-bold text-right">${v}</span></div>`, ch = MP.checks(c);
  $('aDossier').innerHTML = row('Primary patient PAN & Aadhaar', `<span class="font-mono">${esc(c.pan) || '—'} • ${esc(c.aadhaar) || '—'}</span>`) + row('Primary credit bureau score', c.score ? `${esc(c.score)} ${+c.score >= MP.MIN_SCORE ? '(eligible)' : '(below ' + MP.MIN_SCORE + ': nominee active)'}` : 'No credit profile (nominee active)') +
    row('Co-borrower / nominee', MP.needNominee(c) ? `${esc(c.nominee.name) || '—'} (${esc(c.nominee.relation) || '—'}) • PAN ${esc(c.nominee.pan) || '—'} • score ${esc(c.nominee.score) || '—'}` : 'Not required') +
    `<div class="rounded-xl border border-stone-300 p-3 space-y-2 bg-white/40">${ch.map(x => slotRow(c, x.slot, x.t, 'Not uploaded by patient', { editable: false }) + `<p class="text-[11px] pl-1 ${x.ok ? 'text-emerald-700' : 'text-amber-700'}">${x.ok ? '✓ Verified' : 'Pending: ' + x.missing.join(', ')}</p>`).join('')}</div>`;
}
function renderDomains() {
  const c = cur(); if (!c) return;
  $('domFilters').innerHTML = [['all', 'All (10)'], ['critical', 'Critical & Emergency'], ['surgical', 'Surgical & Organ'], ['specialized', 'Specialized & General']].map(([k, l]) => `<button class="px-2.5 py-1 rounded-lg cursor-pointer ${T.filter === k ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}" onclick="T.filter='${k}';renderDomains()">${l}</button>`).join('');
  $('domGrid').innerHTML = MP.DOMAINS.filter(d => (T.filter === 'all' || d.cat === T.filter) && (!T.q || (d.label + d.sub + d.tag).toLowerCase().includes(T.q))).map((d, i) => `<button onclick="selectDomain('${d.key}')" style="border-left:4px solid ${d.color}" class="text-left p-3 rounded-xl cursor-pointer ${c.domain === d.key ? 'border-2 border-brand bg-emerald-50' : 'border border-stone-300 bg-white/60 hover:bg-white'}"><span class="text-[10px] font-bold uppercase" style="color:${d.color}">${d.tag}</span><p class="text-xs font-bold mt-1">${d.label}</p><p class="text-[11px] text-stone-500">${d.sub}</p></button>`).join('') || '<p class="text-xs text-stone-500">No department matches.</p>';
  $('customBar').classList.toggle('hidden', c.domain !== 'others');
}
function selectDomain(k) { setField('domain', k); renderDomains(); }
const addDed = () => { const c = cur(); c.bill.deductions.push({ label: '', amt: '' }); setField('bill.deductions', c.bill.deductions); renderAudit(); };
const delDed = i => { const c = cur(); c.bill.deductions.splice(i, 1); setField('bill.deductions', c.bill.deductions); renderAudit(); };
const setDed = (i, k, v) => { const c = cur(); c.bill.deductions[i][k] = v; setField('bill.deductions', c.bill.deductions); };

// ---------- documents & release ----------
async function upload(key, input) {
  const f = input.files[0], c = cur(); if (!f || !c) return;
  if (f.size > 10 * 1024 * 1024) return toast('File exceeds 10 MB', true);
  const fd = new FormData(); fd.append('file', f);
  try { c.files[key] = (await api(`/api/staff/cases/${c.id}/files/${key}`, { method: 'POST', body: fd })).file; toast('Uploaded ' + f.name); renderAudit(); } catch (e) { fail(e); } finally { input.value = ''; }
}
async function delFile(key) { const c = cur(); if (!confirm('Remove this document?')) return; try { await api(`/api/staff/cases/${c.id}/files/${key}`, { method: 'DELETE' }); delete c.files[key]; renderAudit(); } catch (e) { fail(e); } }
const DOCN = { tpa: 'TPA Approval Letter', bill: 'Final Hospital Bill', kyc: 'Patient PAN & Aadhaar e-KYC', categoryDoc: 'Category Proof', nomineeDoc: 'Nominee KYC' };
function openDoc(key) { const f = cur()?.files[key]; if (f) showDoc(DOCN[key], f); }
async function release() {
  const c = cur(); if (!confirm(`Release the bed and issue the gate pass for ${c.name}?`)) return;
  try { Object.assign(c, await api(`/api/staff/cases/${c.id}/release`, jsonOpts('POST'))); toast('Bed released. Gate pass issued to the patient.'); renderAudit(); } catch (e) { fail(e); }
}
setInterval(() => { const c = cur(); if (!c) return ($('liveTimer').textContent = '--:--'); const s = Math.floor(((c.dischargedAt || Date.now()) - c.createdAt) / 1000); $('liveTimer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
