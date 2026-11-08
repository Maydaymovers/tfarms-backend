import { randomBytes } from 'crypto';

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function newNonce(): string {
  return randomBytes(16).toString('base64');
}

export function unavailablePage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TFarms vendor signup</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f7f4;color:#1f2a1f;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:420px;padding:32px;background:#fff;border-radius:12px;box-shadow:0 1px 8px #0001}</style></head>
<body><main><h1>Signup is unavailable</h1><p>Please try again later.</p></main></body></html>`;
}

export function signupPage(siteKey: string, nonce: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TFarms vendor signup</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f7f4;color:#1f2a1f;margin:0;min-height:100vh;display:grid;place-items:center;padding:16px}
main{width:100%;max-width:440px;background:#fff;border-radius:14px;padding:32px;box-shadow:0 2px 12px #0001}
h1{margin:0 0 4px;font-size:1.5rem}p.sub{margin:0 0 24px;color:#5b6b5b}
label{display:block;font-weight:600;font-size:.9rem;margin:16px 0 6px}
input[type=text],input[type=email]{width:100%;padding:11px 12px;border:1px solid #c8d0c8;border-radius:8px;font-size:1rem}
input:focus{outline:2px solid #2f7d32;border-color:#2f7d32}
button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:8px;background:#2f7d32;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
button:disabled{background:#9db89e;cursor:not-allowed}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
#msg{margin-top:16px;min-height:1.4em;font-size:.95rem}
#msg.err{color:#b3261e}#msg.ok{color:#1b5e20;font-weight:600}
.cf-turnstile{margin-top:16px}
</style>
<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head><body><main>
<h1>Become a vendor</h1><p class="sub">Tell us about your business and we will be in touch.</p>
<form id="f" novalidate>
<label for="name">Business name</label><input id="name" name="name" type="text" maxlength="200" autocomplete="organization" required>
<label for="email">Email</label><input id="email" name="email" type="email" maxlength="320" autocomplete="email" required>
<div class="hp" aria-hidden="true"><label for="website">Website</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<div class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-action="vendor_signup"></div>
<button id="btn" type="submit">Submit</button>
</form>
<div id="msg" role="status" aria-live="polite"></div>
</main>
<script nonce="${nonce}">
var key = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
var f = document.getElementById('f'), btn = document.getElementById('btn'), msg = document.getElementById('msg');
function say(t, c){ msg.textContent = t; msg.className = c || ''; }
f.addEventListener('submit', async function(e){
  e.preventDefault();
  var name = f.name.value.trim(), email = f.email.value.trim();
  var token = (f.querySelector('[name="cf-turnstile-response"]') || {}).value || '';
  if (!name) return say('Please enter your business name.', 'err');
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) return say('Please enter a valid email.', 'err');
  if (!token) return say('Please complete the verification.', 'err');
  btn.disabled = true; say('Submitting...');
  try {
    var res = await fetch('/public/vendor-signup', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Idempotency-Key': key},
      body: JSON.stringify({ name: name, contactEmail: email, turnstileToken: token, website: f.website.value })
    });
    if (res.ok) { f.style.display = 'none'; return say('Thanks, we received your signup.', 'ok'); }
    say(res.status === 429 ? 'Too many attempts. Please try again later.' : 'Unable to submit at this time. Please try again.', 'err');
  } catch (err) { say('Unable to submit at this time. Please try again.', 'err'); }
  btn.disabled = false;
  if (window.turnstile) window.turnstile.reset();
});
</script></body></html>`;
}
