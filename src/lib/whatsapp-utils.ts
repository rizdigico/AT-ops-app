/**
 * sendWhatsAppAlert
 *
 * Sends a single WhatsApp message via CallMeBot.
 * THROWS on any failure so callers can handle it properly —
 * never silently swallow errors (that causes flights to be
 * incorrectly marked notified even when no message was sent).
 */
export async function sendWhatsAppAlert(message: string): Promise<void> {
  const phone  = process.env.CALLMEBOT_PHONE;
  const apiKey = process.env.CALLMEBOT_API_KEY;

  if (!phone || !apiKey) {
    throw new Error("Missing CALLMEBOT_PHONE or CALLMEBOT_API_KEY environment variables");
  }

  const url =
    `https://api.callmebot.com/whatsapp.php` +
    `?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(message)}` +
    `&apikey=${encodeURIComponent(apiKey)}`;

  let body = "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    body = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`);
    }
  } catch (err) {
    // Re-throw fetch/timeout errors with context
    if (err instanceof Error && err.message.startsWith("HTTP ")) throw err;
    throw new Error(`Network error calling CallMeBot: ${(err as Error).message}`);
  }

  // CallMeBot returns 200 even for some error conditions;
  // check for error keywords in the response body.
  const lower = body.toLowerCase();
  if (lower.includes("error") && !lower.includes("message queued")) {
    throw new Error(`CallMeBot rejected the request: ${body.slice(0, 300)}`);
  }
}
