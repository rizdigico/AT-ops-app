import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { getTerminal, parseAndEnforceSGTime, inferType } from "@/lib/flight-utils";

// ---------------------------------------------------------------------------
// Column name aliases — maps messy real-world headers to our internal keys
// ---------------------------------------------------------------------------
const COL = {
  date:          ["date", "Date"],
  agent:         ["agent", "Agent", "airline", "Airline"],
  file_ref:      ["file ref", "File Ref", "fileref", "ref", "Ref", "file_ref", "ID"],
  pax_name:      ["Passenger name", "passenger name", "fila name", "Fila Name", "pax name", "Pax Name", "passenger", "client", "name"],
  pax_count:     ["Total Pax", "total pax", "pax", "Pax", "pax count", "Pax Count", "passengers", "no. of pax"],
  pickup_time:   ["P.Up/ETA", "p.up/eta", "P.up/ETA", "pickup", "Pickup", "eta", "ETA", "p.up", "P.up"],
  dropoff_time:  ["D.Off/ETD", "d.off/etd", "D.off/ETD", "dropoff", "Drop Off", "etd", "ETD", "d.off"],
  flight:        ["flight details", "Flight Details", "flight", "Flight", "flight no", "Flight No"],
  driver:        ["Driver contact", "driver contact", "driver name & contact", "Driver Name & Contact", "driver", "Driver", "driver name", "Driver Name"],
  terminal:      ["Terminal", "terminal"],
  services:      ["services", "Services", "service", "Service"],
  from:          ["from", "From"],
  to:            ["to", "To"],
  supplier:      ["supplier", "Supplier"],
} as const;

function pick(row: Record<string, unknown>, keys: readonly string[]): unknown {
  // Case-insensitive lookup — normalise all row keys to lowercase once
  const lowerMap: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    lowerMap[k.toLowerCase().trim()] = v;
  }
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase().trim()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function safeInt(v: unknown): number {
  const n = parseInt(String(v ?? "1"), 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

// Extract the SGT calendar date (YYYY-MM-DD) from an Excel date cell.
// xlsx with cellDates:true returns a Date object at UTC midnight matching the
// spreadsheet date. Using UTC parts avoids the local-timezone offset issue.
// This is more reliable than slicing the scheduled_time ISO string, which is
// stored as UTC and rolls back to the previous day for times before 08:00 SGT.
function excelDate(v: unknown): string {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number") d = new Date(Math.round((v - 25569) * 86400 * 1000));
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "No file provided." },
        { status: 400 }
      );
    }

    // Convert File -> ArrayBuffer -> Buffer for xlsx
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse workbook — prefer "transport" sheet, fall back to first sheet
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName =
      workbook.SheetNames.find((n) => n.toLowerCase() === "transport") ??
      workbook.SheetNames[0];

    if (!sheetName) {
      return NextResponse.json(
        { success: false, error: "Excel file has no sheets." },
        { status: 422 }
      );
    }

    const sheet = workbook.Sheets[sheetName];
    // raw: true preserves Date objects (from cellDates:true) and numeric time fractions.
    // defval fills empty cells so pick() always sees a key.
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      raw: true,
      defval: "",
    });

    if (!rows.length) {
      return NextResponse.json(
        { success: false, error: "Sheet is empty." },
        { status: 422 }
      );
    }

    const records = [];

    for (const row of rows) {
      const file_ref = safeStr(pick(row, COL.file_ref));
      // Skip rows with no file ref — likely blank spacer rows in the sheet
      if (!file_ref) continue;

      const dateVal    = pick(row, COL.date);
      const pickupVal  = pick(row, COL.pickup_time);
      const dropoffVal = pick(row, COL.dropoff_time);
      const services   = safeStr(pick(row, COL.services));
      const from       = safeStr(pick(row, COL.from));
      const to         = safeStr(pick(row, COL.to));
      const type       = inferType(services, from, to);

      // Use pickup time for Arrivals, drop-off time for Departures.
      // If a Departure has no D.Off/ETD (sometimes omitted), fall back to P.Up/ETA
      // which is the driver's hotel pickup time — still the correct reference time.
      const timeVal = type === "Arrival"
        ? pickupVal
        : (dropoffVal || pickupVal);

      const agent         = safeStr(pick(row, COL.agent));
      const flight_number = safeStr(pick(row, COL.flight));
      // Terminal: use Excel's own Terminal column when present, else derive from airline/flight
      const terminalRaw = safeStr(pick(row, COL.terminal));
      const terminal = terminalRaw || getTerminal(agent || flight_number);

      const scheduled_time = parseAndEnforceSGTime(dateVal, timeVal);

      // Derive the SGT calendar date for this transfer.
      // Primary: read directly from the Excel date cell (UTC-safe).
      // Fallback: convert scheduled_time (UTC) back to SGT and take that date.
      //   Do NOT use scheduled_time.slice(0,10) — that is the UTC date, and
      //   any flight before 08:00 SGT is stored as the previous UTC day.
      const date =
        excelDate(dateVal) ||
        new Date(scheduled_time).toLocaleDateString("en-CA", {
          timeZone: "Asia/Singapore",
        });

      records.push({
        file_ref,
        date,
        pax_name:      safeStr(pick(row, COL.pax_name))      || "Unknown Pax",
        pax_count:     safeInt(pick(row, COL.pax_count)),
        flight_number: flight_number                           || null,
        agent:         agent                                   || null,
        terminal,
        type,
        scheduled_time,
        updated_time:  null,
        driver_info:   safeStr(pick(row, COL.driver))         || null,
        notified:      false,
      });
    }

    if (!records.length) {
      return NextResponse.json(
        { success: false, error: "No valid rows found. Check column headers." },
        { status: 422 }
      );
    }

    // Deduplicate within the batch: keep only the last occurrence of each
    // (file_ref, scheduled_time) pair so the INSERT below never hits
    // "cannot affect row a second time".
    const seen = new Map<string, typeof records[0]>();
    for (const r of records) seen.set(`${r.file_ref}|${r.scheduled_time}`, r);
    const deduped = Array.from(seen.values());

    // ── Delete-then-insert strategy ──────────────────────────────────────────
    // Using upsert with onConflict:"file_ref,scheduled_time" requires that exact
    // composite unique constraint to exist in the DB. If the old single-column
    // "file_ref" constraint is still active, every multi-leg booking (same
    // file_ref, different dates) silently fails for legs 2+.
    //
    // Instead: delete ALL existing rows for the file_refs in this batch, then
    // insert fresh. This works regardless of which constraint is present.
    // The notified flag is preserved: we snapshot which (file_ref, scheduled_time)
    // pairs were already notified before deleting, then restore that flag on insert.

    const batchFileRefs = [...new Set(deduped.map((r) => r.file_ref))];

    // 1. Snapshot notified pairs
    const { data: notifiedRows } = await supabaseAdmin
      .from("flights")
      .select("file_ref, scheduled_time")
      .in("file_ref", batchFileRefs)
      .eq("notified", true);

    const notifiedSet = new Set(
      (notifiedRows ?? []).map((r) => `${r.file_ref}|${r.scheduled_time}`)
    );

    // 2. Delete all existing rows for these file_refs
    const { error: deleteError } = await supabaseAdmin
      .from("flights")
      .delete()
      .in("file_ref", batchFileRefs);

    if (deleteError) {
      console.error("[upload] Delete error:", deleteError);
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    // 3. Insert fresh — restore notified=true for already-alerted legs
    const toInsert = deduped.map((r) => ({
      ...r,
      notified: notifiedSet.has(`${r.file_ref}|${r.scheduled_time}`),
    }));

    const { error: insertError } = await supabaseAdmin
      .from("flights")
      .insert(toInsert);

    if (insertError) {
      console.error("[upload] Insert error:", insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, processedCount: toInsert.length });
  } catch (err) {
    console.error("[upload] Unhandled error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error while parsing file." },
      { status: 500 }
    );
  }
}
