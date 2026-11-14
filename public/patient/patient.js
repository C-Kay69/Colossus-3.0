/* Patient Portal: Step 1 verification -> Step 2 financing -> Step 3 OTP & gate pass. */
const P = { cases: [], id: null, tab: 'verify', user: null };
const cur = () => P.cases.find(c => c.id === P.id);
document.body.insertAdjacentHTML('beforeend', DOC_MODAL);
$('docModal').addEventListener('click', e => e.target === $('docModal') && closeDoc());

const login = mountLogin({ role: 'patient', title: 'Leave the hospital now. Settle the insurance gap in minutes.', blurb: 'Verify your KYC, review your bill gap, choose a plan and collect your gate pass. Your hospital desk must register you before you can sign in.',
  side: 'bg-gradient-to-br from-[#0e7c6b] to-[#063f36]', placeholder: 'registered mobile or email', onSuccess: r => start(r) });
window.onSignedOut = () => signOut(true);
async function signOut(silent) { try { await api('/api/auth/patient/logout', jsonOpts('POST')); } catch (_) {} P.cases = []; P.id = null; $('page').innerHTML = ''; login.show(); if (!silent) toast('Signed out'); }
async function start(user) {
  P.user = user; await load(); if (!P.cases.length) return toast('No admission found for this account.', true);
  P.id = P.cases[0].id; setTab(initialTab());
}
const load = () => api('/api/patient/cases').then(r => (P.cases = r.map(MP.normalize))).catch(fail);
api('/api/auth/patient/me').then(start).catch(() => login.show());

// ---------- navigation & gating ----------
const initialTab = () => { const c = cur(); return MP.steps(c).done[2] ? 'checkout' : MP.verified(c) ? 'finance' : 'verify'; };
function unlocked(t) { const c = cur(), s = MP.steps(c); return t === 'verify' || (t === 'finance' && s.done[1]) || (t === 'checkout' && s.done[2]); }
function setTab(t) {
  if (!unlocked(t)) return toast(t === 'finance' ? 'Complete Step 1 verification to unlock financing.' : 'Approve a financing plan in Step 2 first.', true);
  P.tab = t; renderAll();
}
function renderAll() {
  const c = cur(); if (!c) return;
  renderBanner(c); renderTabs(c); renderTracker(c);
  ({ verify: renderVerify, finance: renderFinance, checkout: renderCheckout })[P.tab](c);
}
function renderTabs(c) {
  const s = MP.steps(c), on = 'px-3 py-1.5 rounded-lg bg-brand text-white shadow-sm cursor-pointer', off = 'px-3 py-1.5 rounded-lg text-stone-600 hover:text-stone-900 cursor-pointer';
  $('tb1').className = P.tab === 'verify' ? on : off; $('tb2').className = P.tab === 'finance' ? on : off; $('tb3').className = P.tab === 'checkout' ? on : off;
  $('tb1').innerHTML = `Step 1: KYC &amp; Credit Verification <span class="ml-1 tag ${s.done[1] ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${s.done[1] ? 'Done' : 'Required first'}</span>`;
  $('tb2').innerHTML = `${s.done[1] ? '' : '🔒 '}Step 2: Gap Financing &amp; Bill`; $('tb3').innerHTML = `${s.done[2] ? '' : '🔒 '}Step 3: OTP &amp; Gate Pass`;
  $('gate').classList.toggle('hidden', s.done[1]);
  $('gate').innerHTML = s.done[1] ? '' : `<div class="rounded-2xl bg-amber-50 border border-amber-300 p-4 text-xs text-amber-900"><b>🔒 Step 1 verification incomplete — financing is locked.</b> Complete every item in the checklist below to unlock Step 2.</div>`;
}
function renderBanner(c) {
  const d = MP.DOMAINS.find(x => x.key === c.domain), cell = (l, v) => `<div><p class="text-[11px] font-semibold uppercase tracking-wider text-stone-400">${l}</p><div class="mt-1">${v}</div></div>`, v = MP.verified(c);
  $('banner').innerHTML = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-4">${cell('Patient', `<p class="text-base font-bold">${esc(c.name)}</p>${P.cases.length > 1 ? `<select class="inp mt-1" onchange="pickCase(this.value)">${P.cases.map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.claimId || x.id)} • bed ${esc(x.bed) || '—'}</option>`).join('')}</select>` : ''}`)}
    ${cell('Ward / bed', `<p class="text-sm font-bold">${c.bed ? 'Bed ' + esc(c.bed) : '—'}</p><p class="text-[11px] text-stone-500">Claim: ${esc(c.claimId) || '—'}</p>`)}${cell('Care domain', d ? `<span class="tag" style="background:${d.color}22;color:${d.color}">${esc(MP.domLabel(c))}</span>` : '<span class="text-xs text-stone-500">Assigned by hospital</span>')}
    ${cell('Borrower classification', `<span class="tag bg-emerald-100 text-emerald-800">${MP.CATS[c.category] || 'Select in Step 1'}</span>`)}${cell('Step 1 status', `<span class="tag rounded-full ${v ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${v ? '✓ Credit verified' : 'Verification required'}</span>`)}</div>`;
}
function pickCase(id) { P.id = id; setTab(initialTab()); }

// ---------- persistence ----------
const timers = {};
function setField(path, val) {
  const c = cur(); if (!c || c.status !== 'registered') return; const p = path.split('.'), last = p.pop(); let o = c; p.forEach(k => (o = o[k])); o[last] = val;
  clearTimeout(timers[c.id]); timers[c.id] = setTimeout(() => api('/api/patient/cases/' + c.id, jsonOpts('PUT', { category: c.category, pan: c.pan, aadhaar: c.aadhaar, score: c.score, nominee: c.nominee })).catch(e => toast(e.message, true)), 450);
  liveVerify();
}
function setAadhaar(raw) { setField('aadhaar', MP.maskAadhaar(raw)); const h = $('aadhaarHint'); if (h) h.textContent = MP.maskAadhaar(raw) ? '✓ Saved as ' + MP.maskAadhaar(raw) + ' (only the last 4 digits are kept)' : 'Enter all 12 digits. Only the last 4 are stored.'; }
function setCategory(k) { const c = cur(); if (c.status !== 'registered') return; c.category = k; setField('category', k); renderAll(); }

// ---------- STEP 1: verification ----------
function renderVerify(c) {
  const lock = c.status !== 'registered', dis = lock ? 'disabled' : '', cdoc = MP.catDoc(c);
  const cards = [['employed', 'Type 1', 'RBI Digital KYC', 'PAN & Aadhaar + salary slip. Nominee fallback if score is low or missing.'], ['businessman', 'Type 2', 'RBI MSME / ITR', 'Business owners: PAN, Aadhaar & GST / ITR.'],
    ['unemployed', 'Type 3', 'Banking Sector Norms', 'Bank statement norms. Nominee is mandatory if you have no credit profile.'], ['senior', 'Type 4', 'Compulsory Nominee', '60+ years: approved on the nominee\'s credit profile.']];
  $('page').innerHTML = `<div class="card space-y-6"><div><span class="tag bg-emerald-100 text-emerald-800">Mandatory Step 1</span><h2 class="text-lg font-bold mt-1">Full Patient &amp; Nominee Credit Profile Verification</h2>
    <p class="text-xs text-stone-500">Enter your details and upload your documents. Every item must be complete to unlock Gap Financing. ${lock ? '<b class="text-amber-700">Locked: you have approved a plan.</b>' : ''}</p></div>
    <div><label class="lbl">1. Select your borrower classification (4 standalone types)</label><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">${cards.map(([k, t, b, d]) => `<button type="button" ${dis} onclick="setCategory('${k}')" class="text-left p-3.5 rounded-xl cursor-pointer ${c.category === k ? 'border-2 border-brand bg-emerald-50' : 'border border-stone-300 bg-white/60 hover:bg-white'}"><div class="flex justify-between"><span class="text-[11px] font-extrabold uppercase text-brand">${t}</span><span class="tag bg-stone-200 text-stone-700">${b}</span></div><p class="text-sm font-bold mt-1">${MP.CATS[k].slice(3)}</p><p class="text-[11px] text-stone-500 mt-0.5">${d}</p></button>`).join('')}</div></div>
    <div class="space-y-3"><h3 class="text-sm font-bold">2. Patient primary KYC &amp; credit profile</h3><div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div><label class="lbl">PAN card number</label><input class="inp font-mono uppercase" maxlength="10" ${dis} value="${esc(c.pan)}" placeholder="ABCDE1234F" oninput="this.value=this.value.toUpperCase();setField('pan',this.value)"></div>
      <div><label class="lbl">Aadhaar number (12 digits)</label><input class="inp font-mono" maxlength="14" ${dis} value="${esc(c.aadhaar)}" placeholder="1234 5678 9012" oninput="setAadhaar(this.value)"><p id="aadhaarHint" class="text-[11px] text-stone-500 mt-1">${c.aadhaar ? '✓ Saved as ' + esc(c.aadhaar) : 'Only the last 4 digits are stored.'}</p></div>
      <div><label class="lbl">CIBIL / Experian score (blank if none)</label><input class="inp" type="number" min="300" max="900" ${dis} value="${esc(c.score)}" placeholder="300 – 900" oninput="setField('score',this.value)"><p id="scoreHint" class="text-[11px] text-stone-500 mt-1"></p></div></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${slotRow(c, 'kyc', '1. Patient PAN & Aadhaar e-KYC document', 'Upload PDF / JPG / PNG', { editable: !lock })}${slotRow(c, 'categoryDoc', '2. ' + cdoc[0], 'Upload ' + cdoc[1], { editable: !lock })}</div></div>
    <div id="nomineeBox" class="hidden p-4 rounded-2xl bg-emerald-50/60 border-2 border-brand space-y-3"><div><span class="tag bg-brand text-white">Nominee credit underwriting active</span><h3 class="text-sm font-bold mt-1">3. Nominee / Co-borrower credit profile &amp; KYC</h3><p id="nomReason" class="text-[11px] text-stone-600"></p></div>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3"><div><label class="lbl">Nominee full name</label><input class="inp" ${dis} value="${esc(c.nominee.name)}" oninput="setField('nominee.name',this.value)"></div>
      <div><label class="lbl">Relationship</label><input class="inp" ${dis} value="${esc(c.nominee.relation)}" placeholder="Spouse / Son / Daughter" oninput="setField('nominee.relation',this.value)"></div>
      <div><label class="lbl">Nominee PAN</label><input class="inp font-mono uppercase" maxlength="10" ${dis} value="${esc(c.nominee.pan)}" oninput="this.value=this.value.toUpperCase();setField('nominee.pan',this.value)"></div>
      <div><label class="lbl">Nominee credit score (${MP.MIN_SCORE}+)</label><input class="inp" type="number" min="300" max="900" ${dis} value="${esc(c.nominee.score)}" oninput="setField('nominee.score',this.value)"></div></div>
      ${slotRow(c, 'nomineeDoc', '3. Nominee PAN, Aadhaar & credit bureau proof', 'Mandatory to verify the nominee', { editable: !lock })}</div>
    <div class="rounded-xl border border-stone-300 bg-white/50 p-4 space-y-2"><p id="vFeedback" class="text-xs"></p><button id="vNext" class="btn" onclick="setTab('finance')">Complete Verification &amp; Unlock Step 2: Gap Financing →</button></div></div>`;
  liveVerify();
}
function liveVerify() {
  const c = cur(); if (!c || P.tab !== 'verify' || !$('nomineeBox')) return;
  const nom = MP.needNominee(c); $('nomineeBox').classList.toggle('hidden', !nom);
  $('nomReason').textContent = c.category === 'senior' ? 'Senior citizens must be co-signed by a nominee. Approval is based on the nominee\'s credit profile.' : `Your score is missing or below ${MP.MIN_SCORE}, so approval is based on a nominee with a ${MP.MIN_SCORE}+ score.`;
  $('scoreHint').textContent = c.category === 'senior' ? 'Nominee is compulsory for senior citizens.' : (+c.score >= MP.MIN_SCORE ? 'Eligible on your own credit profile.' : 'No eligible credit profile: a nominee is required.');
  const ch = MP.checks(c), miss = ch.flatMap(x => x.missing), ok = !miss.length;
  $('vFeedback').innerHTML = ok ? '<b class="text-emerald-700">✓ All items verified. Step 2 is unlocked.</b>' : `<b class="text-amber-700">Still needed (${miss.length}):</b> ${miss.map(esc).join(' • ')}`;
  $('vNext').disabled = !ok; renderBanner(c); renderTabs(c); renderTracker(c);
}
async function upload(key, input) {
  const f = input.files[0], c = cur(); if (!f || !c) return;
  if (f.size > 10 * 1024 * 1024) return toast('File exceeds 10 MB', true);
  const fd = new FormData(); fd.append('file', f);
  try { c.files[key] = (await api(`/api/patient/cases/${c.id}/files/${key}`, { method: 'POST', body: fd })).file; toast('Uploaded ' + f.name); renderAll(); } catch (e) { fail(e); } finally { input.value = ''; }
}
async function delFile(key) { const c = cur(); if (!confirm('Remove this document?')) return; try { await api(`/api/patient/cases/${c.id}/files/${key}`, { method: 'DELETE' }); delete c.files[key]; renderAll(); } catch (e) { fail(e); } }
const DOCN = { tpa: 'Insurance Approval Letter', bill: 'Final Hospital Bill', kyc: 'PAN & Aadhaar e-KYC', categoryDoc: 'Category Proof', nomineeDoc: 'Nominee KYC' };
function openDoc(key) { const f = cur()?.files[key]; if (f) showDoc(DOCN[key], f); }

// ---------- STEP 2: financing ----------
function renderFinance(c) {
  if (!MP.billReady(c)) { $('page').innerHTML = `<div class="card text-center py-10"><p class="text-sm font-bold">Waiting for the hospital billing desk</p><p class="text-xs text-stone-500 mt-1">Your TPA letter, final bill and amounts have not been published yet. This page updates automatically.</p></div>`; return; }
  const g = MP.gapOf(c), P3 = MP.plans(c), approved = c.status !== 'registered', pct = a => (g ? Math.round((+a || 0) / g * 100) : 0);
  $('page').innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="card !p-4"><p class="text-xs font-bold">📄 Insurance Approval Letter</p>${slotRow(c, 'tpa', 'Published by hospital', '', { editable: false })}</div>
    <div class="card !p-4"><p class="text-xs font-bold">🧾 Final Hospital Bill</p>${slotRow(c, 'bill', 'Published by hospital', '', { editable: false })}</div>
    <div class="card !p-4 border-emerald-300"><p class="text-xs font-bold text-emerald-800">✓ Credit profile approved</p><p class="text-[11px] text-stone-600 mt-1">${esc(MP.basis(c))}</p></div></div>
  <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
    <div class="md:col-span-5 card"><h2 class="text-sm font-bold mb-3">Gap Calculation Breakdown</h2><div class="space-y-2.5 text-sm">
      <div class="flex justify-between border-b border-stone-300/60 pb-2"><span class="text-stone-600">Total hospital bill</span><b>${inr(c.bill.total)}</b></div>
      <div class="flex justify-between border-b border-stone-300/60 pb-2"><span class="text-stone-600">Insurance approved (TPA)</span><b class="text-emerald-700">- ${inr(c.bill.tpa)}</b></div>
      <div class="flex justify-between"><span class="text-stone-600">Non-payable deductions</span><b>${inr(g)}</b></div>
      ${c.bill.deductions.map(d => `<div class="flex justify-between text-xs text-stone-500 pl-3"><span>${esc(d.label) || 'Deduction'}</span><span>${inr(d.amt)} • ${pct(d.amt)}% of gap</span></div>`).join('')}</div>
      <div class="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between"><div><p class="text-[11px] font-bold uppercase text-amber-800">Net out-of-pocket gap</p><p class="text-[11px] text-amber-700">Approved for instant gap financing</p></div><div class="text-xl font-extrabold">${inr(g)}</div></div></div>
    <div class="md:col-span-7 card flex flex-col justify-between"><div><div class="flex justify-between items-center mb-3"><div><h2 class="text-sm font-bold">Instant Gap-Financing Options</h2><p class="text-[11px] text-stone-500">Underwritten via ${esc(MP.basis(c))}</p></div><span class="tag rounded-full bg-emerald-100 text-emerald-800">RBI compliant • 0% collateral</span></div>
      <div class="space-y-2.5">${P3.map(p => `<label class="block rounded-xl p-3.5 ${approved ? '' : 'cursor-pointer'} ${c.plan === p.id ? 'border-2 border-brand bg-emerald-50/60' : 'border border-stone-300 bg-white/50 hover:bg-white'}" ${approved ? '' : `onclick="selectPlan(${p.id})"`}><div class="flex items-center justify-between gap-3"><div class="flex items-center gap-3"><input type="radio" name="plan" ${c.plan === p.id ? 'checked' : ''} ${approved ? 'disabled' : ''} class="w-4 h-4 accent-[#0e7c6b]"><div><p class="text-xs sm:text-sm font-bold">${p.name}</p><p class="text-[11px] text-stone-500">${p.desc}</p></div></div><div class="text-right"><b class="text-sm">${inr(p.amt)}</b><span class="block text-[10px] text-stone-500">${p.per}</span></div></div></label>`).join('')}</div></div>
      <div class="mt-5 pt-3.5 border-t border-stone-300/70 space-y-2.5"><p class="text-[11px] text-emerald-700 font-semibold">✓ Credit profile verified. ${approved ? 'Plan approved.' : 'Approve to continue to the final OTP.'}</p>
      <button class="btn w-full !py-3.5 !text-sm" onclick="${approved ? "setTab('checkout')" : 'approve()'}">${approved ? 'Continue to Step 3 →' : 'Approve Loan &amp; Proceed to OTP →'}</button></div></div></div>`;
}
function selectPlan(id) { cur().plan = id; renderFinance(cur()); }
async function approve() { const c = cur(); try { Object.assign(c, await api(`/api/patient/cases/${c.id}/approve`, jsonOpts('POST', { plan: c.plan }))); P.tab = 'checkout'; renderAll(); } catch (e) { fail(e); } }

// ---------- STEP 3: e-sign OTP & gate pass ----------
function renderCheckout(c) {
  const plan = MP.plans(c).find(p => p.id === c.plan), g = MP.gapOf(c);
  const head = `<div class="bg-stone-800 text-white py-2.5 px-4 text-xs font-medium flex justify-between"><span>Step 3: Hospital Discharge Checkout</span><span class="text-emerald-300">${c.bed ? 'Bed ' + esc(c.bed) : ''}</span></div>`;
  const sum = `<div class="bg-white/60 rounded-2xl p-4 border border-stone-300 text-center"><p class="text-xs text-stone-500">Approved hospital discharge gap loan</p><p class="text-3xl font-bold mt-1">${inr(g)}</p><p class="text-xs font-medium text-brand mt-1">Selected plan: ${plan.sum}</p><p class="text-[11px] text-stone-500">Underwritten via ${esc(MP.basis(c))}</p></div>`;
  let body;
  if (c.status === 'discharged') body = `${sum}<div class="rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-5 text-center"><p class="text-xs font-bold uppercase text-emerald-800">✓ Gate pass issued</p><p class="text-2xl font-mono font-extrabold mt-2">${esc(c.gatePass)}</p><p class="text-xs text-stone-600 mt-2">${esc(c.name)} • Bed ${esc(c.bed) || '—'} • ${new Date(c.dischargedAt).toLocaleString('en-IN')}</p><p class="text-[11px] text-stone-500 mt-1">Show this pass at the exit gate.</p></div>`;
  else if (c.status === 'disbursed') body = `${sum}<div class="rounded-2xl border border-sky-300 bg-sky-50 p-4 text-center text-xs text-sky-900"><b>✓ OTP confirmed. Loan disbursal initiated.</b><br>Waiting for the hospital desk to settle and release your bed. This page updates automatically.</div>`;
  else body = `${sum}<div><p class="text-xs text-stone-600 mb-2">An OTP is sent to <b>${esc(P.user.contact)}</b> to e-sign the loan and release the disbursal.</p><button class="btn-ghost w-full mb-3" onclick="sendEsign()">Send e-sign OTP</button>
    <label class="lbl text-center">Enter 4-digit e-sign OTP</label><div class="flex gap-2 justify-center">${otpBoxes('esOtp')}</div></div><button class="btn w-full !py-3.5 !text-sm" onclick="confirmEsign()">Confirm OTP &amp; Disburse</button>`;
  $('page').innerHTML = `<div class="max-w-md mx-auto bg-cream rounded-3xl border-4 border-stone-800 shadow-xl overflow-hidden">${head}<div class="p-6 space-y-5">${body}</div></div>`;
}
async function sendEsign() { try { await api(`/api/patient/cases/${cur().id}/esign/send`, jsonOpts('POST')); toast('OTP sent (check the server terminal)'); document.querySelector('.esOtp').focus(); } catch (e) { fail(e); } }
async function confirmEsign() {
  const otp = readOtp('esOtp'); if (otp.length < 4) return toast('Enter all 4 OTP digits', true);
  try { const c = cur(); Object.assign(c, await api(`/api/patient/cases/${c.id}/esign/confirm`, jsonOpts('POST', { otp }))); renderAll(); toast('OTP confirmed.'); } catch (e) { fail(e); }
}

// ---------- tracker, SLA timer & live sync ----------
function renderTracker(c) {
  const s = MP.steps(c), names = ['Hospital & TPA Bill Synced', 'Full Credit Verification', 'Gap Financing Selection', 'Hospital Settlement'], subs = ['Hospital publishes bill & TPA letter', 'Mandatory first step for patient', 'Unlocks after Step 1', 'Gate pass after bed release'];
  $('tracker').innerHTML = `<div class="flex items-center justify-between mb-4"><h3 class="text-xs font-bold uppercase tracking-wider text-stone-500">Live Discharge &amp; RBI Underwriting Progress</h3><span class="text-xs font-semibold ${s.cur < 0 ? 'text-emerald-700' : 'text-amber-700'}">${s.cur < 0 ? 'Discharged • Gate pass active' : `Step ${s.cur + 1} of 4 • ${names[s.cur]}`}</span></div>
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">${names.map((n, i) => { const d = s.done[i], now = i === s.cur; return `<div class="flex items-start gap-3"><div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white ${d ? 'bg-emerald-600' : now ? 'bg-amber-500 animate-pulse' : 'bg-stone-300 text-stone-600'}">${d ? '✓' : i + 1}</div><div><p class="text-xs font-bold ${d || now ? '' : 'text-stone-400'}">${i + 1}. ${n}</p><p class="text-[11px] ${d ? 'text-emerald-600' : now ? 'text-amber-600' : 'text-stone-400'}">${d ? 'Completed' : subs[i]}</p></div></div>`; }).join('')}</div>`;
}
setInterval(() => { const c = cur(); if (!c) return ($('liveTimer').textContent = '--:--'); const s = Math.floor(((c.dischargedAt || Date.now()) - c.createdAt) / 1000); $('liveTimer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
setInterval(async () => {   // pick up hospital changes (bill published, bed released) without clobbering typing
  const c = cur(); if (!c || $('authOverlay').children.length && !$('authOverlay').classList.contains('hidden')) return;
  try {
    const n = (await api('/api/patient/cases')).map(MP.normalize).find(x => x.id === c.id); if (!n) return;
    const changedStatus = n.status !== c.status, hospital = JSON.stringify([n.bill, n.files.tpa, n.files.bill, n.domain, n.bed, n.claimId]) !== JSON.stringify([c.bill, c.files.tpa, c.files.bill, c.domain, c.bed, c.claimId]);
    if (!changedStatus && !hospital) return;
    Object.assign(c, { status: n.status, bill: n.bill, domain: n.domain, customDomain: n.customDomain, bed: n.bed, claimId: n.claimId, dischargedAt: n.dischargedAt, gatePass: n.gatePass }); c.files.tpa = n.files.tpa; c.files.bill = n.files.bill;
    if (changedStatus || P.tab === 'finance') renderAll(); else { renderBanner(c); renderTracker(c); renderTabs(c); }
  } catch (_) {}
}, 6000);
