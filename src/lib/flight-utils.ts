import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { isValid, parse } from "date-fns";

const TZ = "Asia/Singapore";

// ---------------------------------------------------------------------------
// Terminal mapping — keyed on airline name fragments and IATA codes
// ---------------------------------------------------------------------------
const TERMINAL_MAP: { pattern: RegExp; terminal: string }[] = [
  { pattern: /singapore airlines|silkair|\bsq\b/i, terminal: "T2/T3" },
  { pattern: /scoot|\btr\b/i,                        terminal: "T1" },
  { pattern: /jetstar|\b3k\b|\bjq\b/i,              terminal: "T4" },
  { pattern: /cathay|\bcx\b/i,                       terminal: "T4" },
  { pattern: /emirates|\bek\b/i,                     terminal: "T1" },
  { pattern: /qatar|\bqr\b/i,                        terminal: "T1" },
  { pattern: /malaysia|\bmy\b|\bmh\b/i,              terminal: "T1" },
  { pattern: /thai|\btg\b/i,                         terminal: "T1" },
  { pattern: /air asia|\bak\b|\bfd\b/i,              terminal: "T4" },
  { pattern: /batik|\bod\b/i,                        terminal: "T4" },
  { pattern: /lion air|\bjt\b/i,                     terminal: "T4" },
  { pattern: /garuda|\bga\b/i,                       terminal: "T3" },
  { pattern: /korean|\bke\b/i,                       terminal: "T4" },
  { pattern: /japan airlines|\bjl\b/i,               terminal: "T1" },
  { pattern: /ana|\bnh\b/i,                          terminal: "T1" },
  { pattern: /lufthansa|\blh\b/i,                    terminal: "T1" },
  { pattern: /british|\bba\b/i,                      terminal: "T1" },
  { pattern: /china southern|\bcz\b/i,               terminal: "T2" },
  { pattern: /china eastern|\bmu\b/i,                terminal: "T2" },
  { pattern: /air china|\bca\b/i,                    terminal: "T2" },
];

export function getTerminal(agentOrFlight: string): string {
  if (!agentOrFlight) return "TBC";
  const match = TERMINAL_MAP.find((entry) =>
    entry.pattern.test(agentOrFlight)
  );
  return match?.terminal ?? "TBC";
}

// ---------------------------------------------------------------------------
// Parse raw date + time strings from Excel and lock to SGT (GMT+8)
// Returns an ISO string suitable for Supabase TIMESTAMPTZ
// ---------------------------------------------------------------------------
export function parseAndEnforceSGTime(
  dateValue: unknown,
  timeValue: unknown
): string {
  try {
    // Excel serial number dates (e.g. 45000) -> JS Date
    let baseDate: Date | null = null;

    if (typeof dateValue === "number") {
      // xlsx serial: days since 1899-12-30
      baseDate = new Date(Math.round((dateValue - 25569) * 86400 * 1000));
    } else if (dateValue instanceof Date) {
      baseDate = dateValue;
    } else if (typeof dateValue === "string") {
      // Try common formats
      for (const fmt of ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "d/M/yyyy"]) {
        const parsed = parse(dateValue.trim(), fmt, new Date());
        if (isValid(parsed)) { baseDate = parsed; break; }
      }
    }

    if (!baseDate || !isValid(baseDate)) {
      // Fallback: today in SGT
      baseDate = toZonedTime(new Date(), TZ);
    }

    // Extract hours/minutes from the time cell
    let hours = 0;
    let minutes = 0;

    if (typeof timeValue === "number") {
      // Excel time fraction: 0.5 = 12:00
      const totalMins = Math.round(timeValue * 24 * 60);
      hours = Math.floor(totalMins / 60) % 24;
      minutes = totalMins % 60;
    } else if (timeValue instanceof Date) {
      // xlsx stores time fractions as UTC Date objects (e.g. 06:04 in spreadsheet
      // → 1899-12-30T06:04:35.000Z). Must use UTC accessors — getHours() applies
      // the local timezone offset and shifts every time by +8h on a UTC+8 machine,
      // which is what caused 00:01 in Excel to appear as 08:01 in the app.
      hours = timeValue.getUTCHours();
      minutes = timeValue.getUTCMinutes();
    } else if (typeof timeValue === "string") {
      const match = timeValue.trim().match(/^(\d{1,2}):(\d{2})/);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
      }
    }

    // Build a wall-clock datetime in SGT and convert to UTC for storage
    const year = baseDate.getUTCFullYear();
    const month = baseDate.getUTCMonth() + 1;
    const day = baseDate.getUTCDate();

    const localString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;

    const utcDate = fromZonedTime(localString, TZ);
    return utcDate.toISOString();
  } catch {
    // Hard fallback: now
    return new Date().toISOString();
  }
}

// ---------------------------------------------------------------------------
// Infer transfer type from common Excel column values
// ---------------------------------------------------------------------------
export function inferType(services?: string, from?: string, to?: string): "Arrival" | "Departure" {
  const svc = (services ?? "").toLowerCase();
  const frm = (from ?? "").toLowerCase();
  const to_ = (to ?? "").toLowerCase();

  // Explicit keywords in service description take priority
  if (/\barrival\b|\barr\b/.test(svc)) return "Arrival";
  if (/\bdeparture\b|\bdep\b/.test(svc)) return "Departure";

  // Check From/To fields independently — avoids cross-field regex false matches
  // (e.g. "...Changi Airport | Orchid Hotel..." wrongly matching airport.*hotel)
  const fromIsAirport = /changi|airport|terminal/i.test(frm);
  const toIsAirport   = /changi|airport|terminal/i.test(to_);

  if (fromIsAirport && !toIsAirport) return "Arrival";
  if (toIsAirport && !fromIsAirport) return "Departure";

  // Services text patterns (checked against services alone, not concatenated)
  if (/airport.*to.*hotel|changi.*to.*hotel/i.test(svc)) return "Arrival";
  if (/hotel.*to.*airport|hotel.*to.*changi/i.test(svc)) return "Departure";

  return "Arrival";
}
