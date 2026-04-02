import { NextResponse } from "next/server";
import { addHours, addMinutes, differenceInMinutes, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import webpush from "web-push";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { fetchFlightStatus } from "@/lib/aviation-utils";
import { sendWhatsAppAlert } from "@/lib/whatsapp-utils";

// Prevent Next.js from caching this cron endpoint
export const dynamic = "force-dynamic";

const TZ = "Asia/Singapore";

// Configure VAPID for push notifications (no-op if env vars missing)
if (
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPushNotifications(message: string, tag: string) {
  try {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");

    if (!subs?.length) return;

    const payload = JSON.stringify({ title: "AT Dispatch Alert", body: message, tag });
    await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch((err) => {
          // Remove expired/invalid subscriptions
          if (err.statusCode === 410 || err.statusCode === 404) {
            return supabaseAdmin
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          }
        })
      )
    );
  } catch (err) {
    console.error("[push] Error sending push notifications:", err);
  }
}

export async function GET() {
  try {
    const now = new Date();
    let processed = 0;
    let notified = 0;

    // ── ARRIVALS: poll Aviationstack, alert ≤60 min before landing ────────────

    const arrivalWindowEnd = addHours(now, 4);

    const { data: arrivals, error: arrErr } = await supabaseAdmin
      .from("flights")
      .select("*")
      .eq("type", "Arrival")
      .eq("notified", false)
      .gte("scheduled_time", now.toISOString())
      .lte("scheduled_time", arrivalWindowEnd.toISOString());

    if (arrErr) {
      console.error("[sync-flights] Arrivals fetch error:", arrErr);
      return NextResponse.json({ success: false, error: arrErr.message }, { status: 500 });
    }

    for (const flight of arrivals ?? []) {
      processed++;

      if (!flight.flight_number) continue;

      // Log the API call for quota tracking
      await supabaseAdmin
        .from("api_calls")
        .insert({ flight_number: flight.flight_number });

      const { flightStatus, estimatedArrival } = await fetchFlightStatus(flight.flight_number);

      if (!flightStatus) continue;

      const isCancelled = flightStatus === "cancelled";

      // Persist cancelled status to DB so it shows in the Cancelled tab
      if (isCancelled) {
        await supabaseAdmin
          .from("flights")
          .update({ status_override: "Cancelled" })
          .eq("id", flight.id);
      }

      const baseArrivalIso: string = flight.updated_time ?? flight.scheduled_time;
      let bestArrival = new Date(baseArrivalIso);

      // Condition A: significant time shift → update updated_time in DB
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

      // Condition B: ≤60 min to landing or cancelled → send alert
      const minsToLanding = differenceInMinutes(bestArrival, now);
      if (!isCancelled && minsToLanding > 60) continue;

      const displayTime = format(toZonedTime(bestArrival, TZ), "HH:mm");
      const arrivalNote = isCancelled
        ? "has been CANCELLED"
        : `is arriving at ${displayTime} SGT`;

      const message =
        `🚨 Arrival Alert: Flight ${flight.flight_number} for ${flight.pax_name} ${arrivalNote}. ` +
        `Driver: ${flight.driver_info ?? "TBA"}. Terminal: ${flight.terminal}.`;

      await sendWhatsAppAlert(message);
      await sendPushNotifications(message, `arrival-${flight.id}`);
      await supabaseAdmin
        .from("flights")
        .update({ notified: true })
        .eq("id", flight.id);

      notified++;
    }

    // ── DEPARTURES: no API call needed — alert 60 min before hotel pickup ─────
    // The scheduled_time for a Departure is the hotel pickup time.
    // Alert when pickup is within the next 60 minutes.

    const departureWindowEnd = addMinutes(now, 60);

    const { data: departures, error: depErr } = await supabaseAdmin
      .from("flights")
      .select("*")
      .eq("type", "Departure")
      .eq("notified", false)
      .gte("scheduled_time", now.toISOString())
      .lte("scheduled_time", departureWindowEnd.toISOString());

    if (depErr) {
      console.error("[sync-flights] Departures fetch error:", depErr);
      // Don't abort — arrivals already processed; just log and continue
    }

    for (const flight of departures ?? []) {
      processed++;

      const pickupTime = new Date(flight.scheduled_time);
      const minsToPickup = differenceInMinutes(pickupTime, now);
      const displayTime = format(toZonedTime(pickupTime, TZ), "HH:mm");

      const message =
        `🚗 Departure Alert: Hotel pickup for ${flight.pax_name} (Flight ${flight.flight_number ?? "N/A"}) ` +
        `is in ${minsToPickup} min at ${displayTime} SGT. ` +
        `Driver: ${flight.driver_info ?? "TBA"}. Terminal: ${flight.terminal}.`;

      await sendWhatsAppAlert(message);
      await sendPushNotifications(message, `departure-${flight.id}`);
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
