import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { getTerminal, parseAndEnforceSGTime, inferType } from "@/lib/flight-utils";

// ---------------------------------------------------------------------------
// Column name aliases — maps messy real-world headers to our internal keys
// ---------------------------------------------------------------------------
const COL = {
  date:          ["date"],
  agent:         ["agent", "airline"],
  file_ref:      ["file ref", "fileref", "ref", "file_ref", "id"],
  pax_name:      ["passenger name", "fila name", "pax name", "passenger", "client", "name"],
  pax_count:     ["total pax", "pax", "pax count", "passengers", "no. of pax"],
  pickup_time:   ["p.up/eta", "pickup", "eta", "p.up"],
  dropoff_time:  ["d.off/etd", "dropoff", "drop off", "etd", "d.off"],
  flight:        ["flight details", "flight", "flight no"],
  // "driver contact", "t" (single-letter terminal col) — normalised to lowercase by pick()
  // "__empty_1" handles the Apr 8-14 sheet pattern where col K has no header (xlsx
  // names empty-header columns __EMPTY, __EMPTY_1, … in order of first appearance)
  driver:        ["driver contact", "driver name & contact", "driver", "driver name", "__empty_1"],
  // "t" handles the abbreviated "T" header used in some sheets
  terminal:      ["terminal", "t"],
  services:      ["services", "service"],
  from:          ["from"],
  to:            ["to"],
  supplier:      ["supplier"],
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

      const driver_raw = safeStr(pick(row, COL.driver));
      // Normalise "N/A", "NA", "n/a" etc. → null (no driver assigned yet)
      const driver_info = /^n\/?a$/i.test(driver_raw.trim()) ? null : (driver_raw || null);

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
        driver_info,
        notified:      false,
        services:      services                                || null,
        from_location: from                                    || null,
        to_location:   to                                      || null,
        supplier:      safeStr(pick(row, COL.supplier))       || null,
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

    let { error: insertError } = await supabaseAdmin
      .from("flights")
      .insert(toInsert);

    // Graceful fallback: if insert fails due to missing optional columns (e.g. before
    // the 0005 migration is applied), strip the new fields and retry.
    if (insertError?.code === "42703") {
      console.warn("[upload] New columns not yet migrated — retrying without optional fields");
      const coreOnly = toInsert.map(({ services, from_location, to_location, supplier, ...core }) => core);
      const retry = await supabaseAdmin.from("flights").insert(coreOnly);
      insertError = retry.error;
    }

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
