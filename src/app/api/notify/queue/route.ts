import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { supabaseAdmin } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

const TZ = "Asia/Singapore";

/**
 * GET /api/notify/queue
 *
 * Returns all upcoming unnotified flights, sorted by scheduled_time,
 * with computed time-until values for the dispatcher UI.
 */
export async function GET() {
  try {
    const now = new Date();

    const { data, error } = await supabaseAdmin
      .from("flights")
      .select(
        "id, pax_name, scheduled_time, type, flight_number, driver_info, terminal, file_ref, services, supplier"
      )
      .eq("notified", false)
      .or("status_override.is.null,status_override.neq.Cancelled")
      .gte("scheduled_time", now.toISOString())
      .order("scheduled_time", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const flights = (data ?? []).map((f) => {
      const scheduledMs = new Date(f.scheduled_time).getTime();
      const minsUntil = Math.max(0, Math.round((scheduledMs - now.getTime()) / 60_000));
      return {
        id:         f.id,
        pax_name:   f.pax_name,
        type:       f.type,
        flight_number: f.flight_number,
        driver_info: f.driver_info,
        terminal:   f.terminal,
        file_ref:   f.file_ref,
        services:   f.services,
        supplier:   f.supplier,
        sgtTime:    format(toZonedTime(new Date(f.scheduled_time), TZ), "HH:mm"),
        sgtDate:    format(toZonedTime(new Date(f.scheduled_time), TZ), "dd MMM"),
        minsUntil,
        isDue:      minsUntil <= 60,   // within the 1-hour alert window
      };
    });

    return NextResponse.json({ flights });
  } catch (err) {
    console.error("[notify/queue] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/notify/queue
 *
 * Body: { action: "reset", flightId?: string }
 *
 * Resets notified=false so flights can be re-notified.
 * Useful when a previous blast incorrectly marked flights as notified
 * even though no WhatsApp message was actually sent.
 *
 * - With flightId: resets that one flight only
 * - Without flightId: resets ALL upcoming non-cancelled flights
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      action?: string;
      flightId?: string;
    };

    if (body.action !== "reset") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const now = new Date();
    let query = supabaseAdmin
      .from("flights")
      .update({ notified: false })
      .or("status_override.is.null,status_override.neq.Cancelled")
      .gte("scheduled_time", now.toISOString());

    if (body.flightId) {
      query = supabaseAdmin
        .from("flights")
        .update({ notified: false })
        .eq("id", body.flightId);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notify/queue] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
