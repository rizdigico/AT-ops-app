import { NextResponse } from "next/server";
import { addHours, differenceInMinutes, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { fetchFlightStatus } from "@/lib/aviation-utils";
import { sendWhatsAppAlert } from "@/lib/whatsapp-utils";

// Prevent Next.js from caching this cron endpoint
export const dynamic = "force-dynamic";

const TZ = "Asia/Singapore";

export async function GET() {
  try {
    const now = new Date();
    const windowEnd = addHours(now, 4);

    // Fetch all unnotified arrivals scheduled within the next 4 hours
    const { data: flights, error } = await supabaseAdmin
      .from("flights")
      .select("*")
      .eq("type", "Arrival")
      .eq("notified", false)
      .gte("scheduled_time", now.toISOString())
      .lte("scheduled_time", windowEnd.toISOString());

    if (error) {
      console.error("[sync-flights] Supabase fetch error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!flights?.length) {
      return NextResponse.json({ success: true, processed: 0, notified: 0 });
    }

    let processed = 0;
    let notified = 0;

    for (const flight of flights) {
      processed++;

      if (!flight.flight_number) continue;

      const { flightStatus, estimatedArrival } = await fetchFlightStatus(flight.flight_number);

      // Skip if we couldn't get live data
      if (!flightStatus) continue;

      const isCancelled = flightStatus === "cancelled";

      // Best known arrival time: prefer updated_time set by a previous sync run,
      // otherwise fall back to the original scheduled_time from the spreadsheet.
      const baseArrivalIso: string = flight.updated_time ?? flight.scheduled_time;
      let bestArrival = new Date(baseArrivalIso);

      // --- Condition A: detect significant time shift (>15 min) ---
      if (estimatedArrival && !isCancelled) {
        const estimated = new Date(estimatedArrival);
        const shiftMins = differenceInMinutes(estimated, bestArrival);

        if (Math.abs(shiftMins) > 15) {
          bestArrival = estimated;

          await supabaseAdmin
            .from("flights")
            .update({ updated_time: estimated.toISOString() })
            .eq("id", flight.id);
        }
      }

      // --- Condition B: send alert if ≤60 min away OR just cancelled ---
      const minsToLanding = differenceInMinutes(bestArrival, now);
      const shouldAlert = isCancelled || minsToLanding <= 60;

      if (!shouldAlert) continue;

      // Format display time in SGT
      const arrivalSGT = toZonedTime(bestArrival, TZ);
      const displayTime = format(arrivalSGT, "HH:mm");

      const arrivalNote = isCancelled
        ? "has been CANCELLED"
        : `is arriving at ${displayTime}`;

      const message =
        `🚨 Update: Flight ${flight.flight_number} for ${flight.pax_name} ${arrivalNote}. ` +
        `Driver: ${flight.driver_info ?? "TBA"}. Terminal: ${flight.terminal}.`;

      await sendWhatsAppAlert(message);

      // Mark notified immediately to prevent duplicate alerts on next cron run
      await supabaseAdmin
        .from("flights")
        .update({ notified: true })
        .eq("id", flight.id);

      notified++;
    }

    return NextResponse.json({ success: true, processed, notified });
  } catch (err) {
    console.error("[sync-flights] Unhandled error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
