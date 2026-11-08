const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Action the signup page sets on the widget (data-action) and the server expects back. */
export const SIGNUP_ACTION = 'vendor_signup';

/** Frontend hostnames that may host the widget. Override with TURNSTILE_HOSTNAMES (comma separated). */
export function allowedHostnames(): string[] {
  const raw = process.env.TURNSTILE_HOSTNAMES?.trim() || 'api.tfarmsdigitalbank.com';
  return raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/**
 * True only when Cloudflare confirms the token AND it was issued for the signup
 * action on an approved hostname. Any error or timeout is a failure.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp?: string,
  expected: { action: string; hostnames: string[] } = { action: SIGNUP_ACTION, hostnames: allowedHostnames() },
): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean; action?: string; hostname?: string };
    return (
      data.success === true &&
      data.action === expected.action &&
      typeof data.hostname === 'string' &&
      expected.hostnames.includes(data.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}
