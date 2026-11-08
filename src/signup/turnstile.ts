const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** True only when Cloudflare confirms the token. Any error or timeout is a failure. */
export async function verifyTurnstile(secret: string, token: string, remoteIp?: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
