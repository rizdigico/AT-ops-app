import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { sendWhatsAppAlert } from "@/lib/whatsapp-utils";

export const dynamic = "force-dynamic";

const TZ = "Asia/Singapore";

/**
 * POST /api/notify/send-now
 *
 * Sends a WhatsApp notification for ONE flight at a time.
 *
 * Body (optional JSON):
 *   { flightId: string }  — send this specific flight
 *   {}                    — send the next unnotified upcoming flight
 *
 * Returns:
 *   { success, sent, skipped, remaining, flight?, error? }
 *
 * A flight is only marked notified=true if sendWhatsAppAlert() resolves
 * without throwing — so a silent API failure never incorrectly marks a
 * flight as notified.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { flightId?: string };
    const targetId = body.flightId ?? null;

    const now = new Date();
    const nowIso = now.toISOString();

    // Build query for one flight
    let query = supabaseAdmin
      .from("flights")
      .select("*")
      .eq("notified", false)
      .or("status_override.is.null,status_override.neq.Cancelled")
      .gte("scheduled_time", nowIso)
      .order("scheduled_time", { ascending: true })
      .limit(1);

    if (targetId) {
      // Override: send a specific flight regardless of its position in the queue
      query = supabaseAdmin
        .from("flights")
        .select("*")
        .eq("id", targetId)
        .eq("notified", false)
        .limit(1);
    }

    const { data: flights, error: fetchErr } = await query;

    if (fetchErr) {
      console.error("[notify/send-now] DB fetch error:", fetchErr);
      return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    }

    if (!flights?.length) {
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: 0,
        remaining: 0,
        message: targetId
          ? "Flight not found or already notified."
          : "No unnotified upcoming flights.",
      });
    }

    const flight = flights[0];

    const sgtTime = format(toZonedTime(new Date(flight.scheduled_time), TZ), "HH:mm");
    const sgtDate = format(toZonedTime(new Date(flight.scheduled_time), TZ), "dd MMM");
    const driver   = flight.driver_info   || "TBA";
    const terminal = flight.terminal      || "TBC";
    const flightNo = flight.flight_number || "N/A";

    let message: string;
    if (flight.type === "Arrival") {
      message =
        `✈️ ARRIVAL | ${sgtDate} ${sgtTime} SGT\n` +
        `Pax: ${flight.pax_name}\n` +
        `Flight: ${flightNo}  Terminal: ${terminal}\n` +
        `Driver: ${driver}\n` +
        `Ref: ${flight.file_ref}`;
    } else if (flight.type === "Tour") {
      message =
        `🗺️ TOUR | ${sgtDate} ${sgtTime} SGT\n` +
        `Pax: ${flight.pax_name}\n` +
        `Service: ${flight.services || "City Tour"}\n` +
        `Driver: ${driver}\n` +
        `Ref: ${flight.file_ref}`;
    } else {
      // Departure
      message =
        `🚗 DEPARTURE | ${sgtDate} ${sgtTime} SGT (hotel pickup)\n` +
        `Pax: ${flight.pax_name}\n` +
        `Flight: ${flightNo}  Terminal: ${terminal}\n` +
        `Driver: ${driver}\n` +
        `Ref: ${flight.file_ref}`;
    }

    try {
      await sendWhatsAppAlert(message);
    } catch (waErr) {
      // Message was NOT sent — do NOT mark as notified
      const errMsg = waErr instanceof Error ? waErr.message : "Unknown WhatsApp error";
      console.error("[notify/send-now] WhatsApp send failed:", errMsg);
      return NextResponse.json({
        success: false,
        sent: 0,
        skipped: 1,
        error: errMsg,
      });
    }

    // Message confirmed sent — now mark notified
    await supabaseAdmin
      .from("flights")
      .update({ notified: true })
      .eq("id", flight.id);

    // Count remaining unnotified upcoming flights
    const { count: remaining } = await supabaseAdmin
      .from("flights")
      .select("id", { count: "exact", head: true })
      .eq("notified", false)
      .or("status_override.is.null,status_override.neq.Cancelled")
      .gte("scheduled_time", nowIso);

    return NextResponse.json({
      success: true,
      sent: 1,
      skipped: 0,
      remaining: remaining ?? 0,
      flight: {
        id: flight.id,
        pax_name: flight.pax_name,
        type: flight.type,
        sgtTime,
        sgtDate,
      },
    });
  } catch (err) {
    console.error("[notify/send-now] Unhandled error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
