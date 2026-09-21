const CLOUDFLARE_TURNSTILE_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Bot check on submissions.
 *
 * The previous version always called Cloudflare and then ignored the result
 * outside production, which meant every local submission paid for a network
 * round trip to an endpoint that was going to be disregarded. Now: no secret
 * configured means the check is genuinely off, and when it is configured it
 * is enforced everywhere.
 */
export async function verifyTurnstile(
  token: string | undefined,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };

  if (!token) {
    return { ok: false, reason: "Missing bot-check token" };
  }

  try {
    const body = new FormData();
    body.append("secret", secret);
    body.append("response", token);

    const response = await fetch(CLOUDFLARE_TURNSTILE_URL, {
      method: "POST",
      body,
    });
    const result = (await response.json()) as { success?: boolean };

    return result.success
      ? { ok: true }
      : { ok: false, reason: "Bot check failed" };
  } catch (err) {
    console.error("[turnstile] verification error:", err);
    return { ok: false, reason: "Bot check unavailable" };
  }
}
