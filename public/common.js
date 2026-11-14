/* UI helpers shared by the staff and patient portals. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const inr = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const kb = n => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const jsonOpts = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
async function api(url, opts = {}) {
  const r = await fetch(url, opts), j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Request failed'); e.status = r.status; throw e; }
  return j;
}
let toastT;
function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg;
  t.className = `fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-lg ${bad ? 'bg-rose-600' : 'bg-stone-900'}`;
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3500);
}
const fail = e => { if (e.status === 401 && window.onSignedOut) return window.onSignedOut(); toast(e.message, true); };

// OTP boxes
const otpBoxes = cls => [0, 1, 2, 3].map(() => `<input class="otp ${cls}" maxlength="1" inputmode="numeric" oninput="otpKey(this)" onkeydown="otpBack(event,this)">`).join('');
const otpKey = el => { el.value = el.value.replace(/\D/g, '').slice(0, 1); if (el.value && el.nextElementSibling) el.nextElementSibling.focus(); };
const otpBack = (e, el) => { if (e.key === 'Backspace' && !el.value && el.previousElementSibling) el.previousElementSibling.focus(); };
const readOtp = cls => [...document.querySelectorAll('.' + cls)].map(i => i.value).join('');

// Sign-in overlay (one per portal; the role decides which API it talks to)
function mountLogin({ role, title, blurb, side, placeholder, onSuccess }) {
  const canRegister = role === 'patient';
  $('authOverlay').innerHTML = `<div class="bg-cream w-full max-w-3xl rounded-3xl shadow-2xl border border-stone-300 overflow-hidden grid grid-cols-1 md:grid-cols-5 my-auto">
    <div class="md:col-span-2 ${side} text-white p-8 flex flex-col justify-between gap-8">
      <div><p class="text-xl font-extrabold">MedPay <span class="text-emerald-300">Instant</span></p><p class="text-[11px] text-white/80">RBI Compliant Healthcare Gap Financing</p>
        <h1 class="text-xl font-bold leading-snug mt-6">${title}</h1><p class="text-xs text-white/85 mt-3">${blurb}</p></div>
      <a href="/" class="text-[11px] underline text-white/80">← Switch portal</a></div>
    <div class="md:col-span-3 p-6 sm:p-8 space-y-5">
      <div class="flex items-center justify-between gap-3"><div><span class="text-[11px] font-bold uppercase tracking-wider text-brand">Secure ${role === 'staff' ? 'Hospital Staff' : 'Patient'} Access</span><h2 id="authTitle" class="text-xl font-bold text-stone-900">Sign in</h2></div>
        ${canRegister ? '<button type="button" id="authModeBtn" class="text-xs font-semibold text-brand underline">Create patient login</button>' : ''}</div>
      <p id="authNote" class="hidden text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5"></p>
      ${canRegister ? '<div id="authNameWrap" class="hidden"><label class="lbl" for="authName">Patient full name</label><input id="authName" class="inp !py-2.5 !text-sm" autocomplete="name"></div>' : ''}
      <div><label class="lbl" for="authContact">Registered email or 10-digit mobile</label>
        <div class="flex gap-2"><input id="authContact" class="inp !py-2.5 !text-sm" placeholder="${placeholder}" autocomplete="off"><button type="button" id="sendOtpBtn" class="btn whitespace-nowrap">Send OTP</button></div></div>
      <div id="otpSection" class="hidden p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
        <p class="text-xs font-bold text-emerald-950">Enter the 4-digit OTP</p>
        <p class="text-[11px] text-stone-600">No SMS gateway is configured: the OTP is printed in the terminal running the server.</p>
        <div class="flex items-center justify-between gap-3 flex-wrap"><div class="flex gap-2">${otpBoxes('authOtp')}</div><button type="button" id="verifyBtn" class="btn">Verify &amp; Enter</button></div></div>
      <p id="authErr" class="hidden text-xs font-semibold text-rose-600"></p></div></div>`;
  const err = m => { $('authErr').textContent = m || ''; $('authErr').classList.toggle('hidden', !m); };
  let registering = false;
  if (canRegister) $('authModeBtn').onclick = () => {
    registering = !registering;
    $('authTitle').textContent = registering ? 'Create patient login' : 'Sign in';
    $('authModeBtn').textContent = registering ? 'Back to sign in' : 'Create patient login';
    $('authNameWrap').classList.toggle('hidden', !registering);
    $('sendOtpBtn').textContent = registering ? 'Create login & send OTP' : 'Send OTP';
    $('otpSection').classList.add('hidden');
    document.querySelectorAll('.authOtp').forEach(i => (i.value = ''));
    err('');
  };
  $('sendOtpBtn').onclick = async () => { err(''); try { await api(`/api/auth/${role}/send`, jsonOpts('POST', { contact: $('authContact').value, name: canRegister && registering ? $('authName').value : '', register: registering })); $('otpSection').classList.remove('hidden'); $('sendOtpBtn').textContent = 'Resend OTP'; document.querySelector('.authOtp').focus(); } catch (e) { err(e.message); } };
  $('verifyBtn').onclick = async () => {
    const otp = readOtp('authOtp'); if (otp.length < 4) return err('Enter all 4 digits of the OTP.');
    try { const r = await api(`/api/auth/${role}/verify`, jsonOpts('POST', { contact: $('authContact').value, otp, name: canRegister && registering ? $('authName').value : '', register: registering })); $('authOverlay').classList.add('hidden'); err(''); onSuccess(r, $('authContact').value.trim()); } catch (e) { err(e.message); }
  };
  return { show(note) { registering = false; if (canRegister) { $('authTitle').textContent = 'Sign in'; $('authModeBtn').textContent = 'Create patient login'; $('authNameWrap').classList.add('hidden'); $('authName').value = ''; } $('authContact').value = ''; $('otpSection').classList.add('hidden'); $('sendOtpBtn').textContent = 'Send OTP'; document.querySelectorAll('.authOtp').forEach(i => (i.value = '')); err('');
    $('authNote').textContent = note || ''; $('authNote').classList.toggle('hidden', !note); $('authOverlay').classList.remove('hidden'); } };
}

// Document slot row + viewer (urls are served only to signed-in users)
function slotRow(c, key, label, hint, { editable = true, upFn = 'upload', delFn = 'delFile' } = {}) {
  const f = c.files[key];
  return `<div class="flex items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white/70 p-2.5 text-xs">
    <div class="min-w-0"><p class="font-bold">${label}</p><p class="text-[11px] truncate ${f ? 'text-emerald-700' : 'text-stone-500'}">${f ? esc(f.name) + ' • ' + kb(f.size) : hint}</p></div>
    <div class="flex items-center gap-2 shrink-0">${f ? `<button class="text-[11px] font-semibold text-brand underline cursor-pointer" onclick="openDoc('${key}')">View</button>` : ''}
    ${editable ? `${f ? `<button class="text-[11px] text-rose-600 underline cursor-pointer" onclick="${delFn}('${key}')">Remove</button>` : ''}<label class="btn-dark">${f ? 'Replace' : 'Upload'}<input type="file" accept=".pdf,.jpg,.jpeg,.png" class="hidden" onchange="${upFn}('${key}',this)"></label>` : ''}</div></div>`;
}
function showDoc(title, f) {
  $('docTitle').textContent = `${title} — ${f.name}`; $('docOpen').href = f.url;
  $('docBody').innerHTML = f.type === 'application/pdf' ? `<iframe src="${f.url}" class="w-full h-full bg-white"></iframe>` : `<img src="${f.url}" class="max-w-full max-h-full object-contain">`;
  $('docModal').classList.remove('hidden');
}
function closeDoc() { $('docModal').classList.add('hidden'); $('docBody').innerHTML = ''; }
document.addEventListener('keydown', e => e.key === 'Escape' && closeDoc());
const DOC_MODAL = `<div id="docModal" class="hidden fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-4"><div class="bg-cream w-full max-w-4xl rounded-2xl shadow-2xl border border-stone-300 overflow-hidden">
  <div class="bg-stone-900 text-white px-5 py-3 flex items-center justify-between gap-3"><h3 id="docTitle" class="text-sm font-semibold truncate"></h3><div class="flex gap-2 shrink-0"><a id="docOpen" target="_blank" class="px-3 py-1.5 rounded-lg bg-stone-700 hover:bg-stone-600 text-xs">Open in new tab</a><button onclick="closeDoc()" class="px-3 py-1.5 rounded-lg bg-stone-700 hover:bg-stone-600 text-xs cursor-pointer">Close</button></div></div>
  <div id="docBody" class="bg-stone-200/70 h-[75vh] overflow-auto flex items-center justify-center"></div></div></div><div id="toast" class="hidden"></div>`;
