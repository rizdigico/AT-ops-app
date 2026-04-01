export async function sendWhatsAppAlert(message: string): Promise<void> {
  const phone = process.env.CALLMEBOT_PHONE;
  const apiKey = process.env.CALLMEBOT_API_KEY;

  if (!phone || !apiKey) {
    console.error("[whatsapp] Missing CALLMEBOT_PHONE or CALLMEBOT_API_KEY env vars");
    return;
  }

  const encodedMessage = encodeURIComponent(message);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[whatsapp] Send failed: HTTP ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error("[whatsapp] Failed to send message:", err);
  }
}
