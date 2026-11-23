export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TFarms payouts</title>
<style>
body{font:15px system-ui,sans-serif;margin:24px auto;max-width:980px;padding:0 16px;color:#111}
h1{font-size:20px} h2{font-size:16px;margin-top:28px}
input,button{font:inherit;padding:6px 10px} button{cursor:pointer}
table{border-collapse:collapse;width:100%} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:14px}
.warn{color:#b00020} .ok{color:#0a7a2f} .muted{color:#666}
</style></head><body>
<h1>TFarms payouts</h1>
<p>API key: <input id="key" type="password" size="36" autocomplete="off"> <button id="save">Load</button>
<span class="muted">Kept in this tab only.</span></p>
<div id="msg" class="muted"></div>

<h2>Vendors</h2>
<table id="vendors"><thead><tr><th>Name</th><th>Status</th><th>PayPal email</th><th>QuickBooks ID</th><th></th></tr></thead><tbody></tbody></table>

<h2>New payout</h2>
<p><select id="nv"></select> <input id="na" placeholder="Amount, e.g. 1.00" size="14"> <button id="create">Create PayPal payout</button>
<span class="muted">Creates it as PENDING. Nothing is sent until you press Send below.</span></p>

<h2>Pending payouts</h2>
<table id="pending"><thead><tr><th>Vendor</th><th>PayPal email</th><th>QuickBooks ID</th><th>Amount</th><th></th></tr></thead><tbody></tbody></table>

<h2>All payouts</h2>
<p><button id="reconcile">Check PayPal status of PROCESSING payouts</button></p>
<table id="all"><thead><tr><th>Created</th><th>Vendor</th><th>Amount</th><th>Rail</th><th>Status</th><th>PayPal batch</th><th>Failure reason</th></tr></thead><tbody></tbody></table>

<script>
const $ = (id) => document.getElementById(id);
const keyEl = $('key');
keyEl.value = sessionStorage.getItem('k') || '';
function say(t, cls) { const m = $('msg'); m.textContent = t; m.className = cls || 'muted'; }
async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'x-api-key': keyEl.value, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error((data && data.message) ? [].concat(data.message).join(', ') : 'HTTP ' + res.status);
  return data;
}
function cell(tr, text) { const td = document.createElement('td'); td.textContent = text == null ? '' : String(text); tr.appendChild(td); return td; }
function clear(id) { $(id).querySelector('tbody').replaceChildren(); return $(id).querySelector('tbody'); }

async function load(keep) {
  sessionStorage.setItem('k', keyEl.value);
  if (!keep) say('Loading...');
  try {
    const [payouts, vendors] = await Promise.all([api('GET', '/payouts'), api('GET', '/vendors')]);
    const vmap = {}; for (const v of vendors) vmap[v.id] = v;
    const pb = clear('pending'), ab = clear('all');
    const vb = clear('vendors'), sel = $('nv'); sel.replaceChildren();
    for (const v of vendors) {
      if (!v.name) continue;
      const tr = document.createElement('tr');
      cell(tr, v.name); cell(tr, v.status); cell(tr, v.hasPaypalEmail ? 'set' : 'MISSING'); cell(tr, v.hasQboVendorId ? 'set' : 'MISSING');
      const td = document.createElement('td');
      const be = document.createElement('button'); be.textContent = 'Set PayPal email'; be.onclick = () => setField(v, 'paypal-email', 'paypalEmail', 'PayPal email for ' + v.name);
      const bq = document.createElement('button'); bq.textContent = 'Set QuickBooks ID'; bq.onclick = () => setField(v, 'qbo-vendor-id', 'qboVendorId', 'QuickBooks vendor ID for ' + v.name);
      td.append(be, ' ', bq); tr.appendChild(td); vb.appendChild(tr);
      const o = document.createElement('option'); o.value = v.id; o.textContent = v.name; sel.appendChild(o);
    }
    for (const p of payouts) {
      const v = vmap[p.vendorId] || {};
      const name = v.name || p.vendorId;
      const ar = document.createElement('tr');
      cell(ar, new Date(p.createdAt).toLocaleString()); cell(ar, name); cell(ar, p.currency + ' ' + Number(p.amount).toFixed(2));
      cell(ar, p.rail); cell(ar, p.status); cell(ar, p.externalTransactionId || ''); cell(ar, p.failureReason || '');
      ab.appendChild(ar);
      if (p.status === 'PENDING' && p.rail === 'PAYPAL') {
        const tr = document.createElement('tr');
        cell(tr, name); cell(tr, v.hasPaypalEmail ? 'set' : 'MISSING'); cell(tr, v.hasQboVendorId ? 'set' : 'MISSING');
        cell(tr, p.currency + ' ' + Number(p.amount).toFixed(2));
        const td = document.createElement('td'); const b = document.createElement('button'); b.textContent = 'Send';
        const ready = v.status === 'ACTIVE' && v.hasPaypalEmail;
        b.disabled = !ready; if (!ready) b.title = 'Vendor must be ACTIVE with a PayPal email';
        b.onclick = () => send(p, v, name);
        td.appendChild(b); tr.appendChild(td); pb.appendChild(tr);
      }
    }
    if (!keep) say(pb.children.length + ' pending, ' + payouts.length + ' total.', 'ok');
  } catch (e) { say(e.message, 'warn'); }
}
async function setField(v, path, field, label) {
  const val = prompt(label);
  if (!val) return;
  say('Saving...');
  try { await api('PUT', '/vendors/' + v.id + '/' + path, { [field]: val.trim() }); say('Saved.', 'ok'); }
  catch (e) { say(e.message, 'warn'); }
  load(true);
}
$('create').onclick = async () => {
  const id = $('nv').value, amount = $('na').value.trim();
  if (!id || !amount) return say('Pick a vendor and enter an amount.', 'warn');
  if (!confirm('Create a PENDING PayPal payout of USD ' + amount + '?')) return;
  try {
    const res = await fetch('/payouts', { method: 'POST', headers: { 'x-api-key': keyEl.value, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ vendorId: id, amount, rail: 'PAYPAL' }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error([].concat(d.message || 'HTTP ' + res.status).join(', '));
    $('na').value = ''; say('Created. Find it under Pending payouts and press Send.', 'ok');
  } catch (e) { say(e.message, 'warn'); }
  load(true);
};
async function send(p, v, name) {
  const amt = p.currency + ' ' + Number(p.amount).toFixed(2);
  if (!confirm('Send ' + amt + ' to ' + name + ' through PayPal to the PayPal email saved for this vendor? This moves real money.')) return;
  say('Sending...');
  try { const r = await api('POST', '/payouts/' + p.id + '/send'); say('Sent. Status: ' + r.status, 'ok'); }
  catch (e) { say(e.message, 'warn'); }
  load(true);
}
$('save').onclick = () => load();
$('reconcile').onclick = async () => {
  say('Asking PayPal...');
  try { const r = await api('POST', '/payouts/reconcile'); say(r.length ? r.map((x) => x.id.slice(0, 8) + ': ' + x.status).join('; ') : 'Nothing to check.', 'ok'); }
  catch (e) { say(e.message, 'warn'); }
  load(true);
};
if (keyEl.value) load();
</script></body></html>
`;
