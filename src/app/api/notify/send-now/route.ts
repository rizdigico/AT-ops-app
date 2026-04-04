import { NextResponse } from "next/server";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { sendWhatsAppAlert } from "@/lib/whatsapp-utils";

export const dynamic = "force-dynamic";

const TZ = "Asia/Singapore";

/**
 * POST /api/notify/send-now
 *
 * Immediately sends a WhatsApp notification for every unnotified, non-cancelled
 * flight scheduled from now onwards (today + future).  No time-window gating —
 * the dispatcher pressing "Send Now" wants an instant blast regardless of how
 * far out the transfers are.
 *
 * Returns { success, sent, skipped } where:
 *   sent    = number of flights a WhatsApp message was dispatched for
 *   skipped = flights that were already notified or had no useful data
 */
export async function POST() {
  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // Fetch all unnotified, non-cancelled upcoming flights
    const { data: flights, error } = await supabaseAdmin
      .from("flights")
      .select("*")
      .eq("notified", false)
      .or("status_override.is.null,status_override.neq.Cancelled")
      .gte("scheduled_time", nowIso)
      .order("scheduled_time", { ascending: true });

    if (error) {
      console.error("[notify/send-now] DB fetch error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!flights?.length) {
      return NextResponse.json({ success: true, sent: 0, skipped: 0, message: "No upcoming unnotified flights." });
    }

    let sent = 0;
    let skipped = 0;

    for (const flight of flights) {
      const sgtTime = format(toZonedTime(new Date(flight.scheduled_time), TZ), "HH:mm");
      const sgtDate = format(toZonedTime(new Date(flight.scheduled_time), TZ), "dd MMM");

      const driver   = flight.driver_info || "TBA";
      const terminal = flight.terminal    || "TBC";
      const flightNo = flight.flight_number || "N/A";

      let message: string;

      if (flight.type === "Arrival") {
        message =
          `✈️ ARRIVAL | ${sgtDate} ${sgtTime} SGT\n` +
          `Pax: ${flight.pax_name}\n` +
          `Flight: ${flightNo}  Terminal: ${terminal}\n` +
          `Driver: ${driver}\n` +
          `Ref: ${flight.file_ref}`;
      } else {
        message =
          `🚗 DEPARTURE | ${sgtDate} ${sgtTime} SGT (hotel pickup)\n` +
          `Pax: ${flight.pax_name}\n` +
          `Flight: ${flightNo}  Terminal: ${terminal}\n` +
          `Driver: ${driver}\n` +
          `Ref: ${flight.file_ref}`;
      }

      try {
        await sendWhatsAppAlert(message);

        // Mark as notified so this flight isn't blasted again
        await supabaseAdmin
          .from("flights")
          .update({ notified: true })
          .eq("id", flight.id);

        sent++;
      } catch (err) {
        console.error(`[notify/send-now] Failed for flight ${flight.id}:`, err);
        skipped++;
      }
    }

    return NextResponse.json({ success: true, sent, skipped });
  } catch (err) {
    console.error("[notify/send-now] Unhandled error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
