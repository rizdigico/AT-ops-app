import { create } from "zustand";

export type TransferStatus = "On Time" | "Delayed" | "Cancelled";
export type TransferType = "Arrival" | "Departure";

// UI-layer flight (what components consume)
export interface Flight {
  id: string;
  date: string;
  pax_name: string;
  pax_count: number;
  flight_number: string;
  agent: string;
  terminal: string;
  type: TransferType;
  scheduled_time: string;   // formatted HH:MM SGT
  updated_time?: string;    // formatted HH:MM SGT, present when delayed
  driver_info: string;
  notified: boolean;
  status: TransferStatus;
}

// Extended type used by 3D visualisation components
export interface CyberFlight extends Flight {
  progress?: number;
  isPulsingNode?: boolean;
}

// Raw Supabase row (mirrors the DB schema exactly)
export interface DbFlight {
  id: string;
  file_ref: string;
  date: string;
  pax_name: string;
  pax_count: number;
  flight_number: string | null;
  agent: string | null;
  terminal: string | null;
  type: "Arrival" | "Departure";
  scheduled_time: string;   // ISO 8601 / TIMESTAMPTZ
  updated_time: string | null;
  driver_info: string | null;
  notified: boolean;
  created_at: string;
}

const SGT_FMT = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fmtTime(iso: string): string {
  try { return SGT_FMT.format(new Date(iso)); }
  catch { return iso; }
}

// Derive status from DB fields:
// - updated_time set + ≥15 min diff → Delayed
// - We keep the door open for Cancelled via the Cron job later
export function mapDbFlight(row: DbFlight): Flight {
  let status: TransferStatus = "On Time";
  if (row.updated_time) {
    const diffMs =
      new Date(row.updated_time).getTime() -
      new Date(row.scheduled_time).getTime();
    if (Math.abs(diffMs) >= 15 * 60 * 1000) status = "Delayed";
  }

  return {
    id: row.id,
    date: row.date,
    pax_name: row.pax_name,
    pax_count: row.pax_count,
    flight_number: row.flight_number ?? "",
    agent: row.agent ?? "",
    terminal: row.terminal ?? "TBC",
    type: row.type,
    scheduled_time: fmtTime(row.scheduled_time),
    updated_time: row.updated_time ? fmtTime(row.updated_time) : undefined,
    driver_info: row.driver_info ?? "",
    notified: row.notified,
    status,
  };
}

interface AppState {
  flights: Flight[];
  isLoading: boolean;
  setFlights: (flights: Flight[]) => void;
  setLoading: (v: boolean) => void;
  applyRealtimeEvent: (event: "INSERT" | "UPDATE" | "DELETE", row: DbFlight) => void;
}

export const useAppStore = create<AppState>((set) => ({
  flights: [],
  isLoading: true,

  setFlights: (flights) => set({ flights }),
  setLoading: (v) => set({ isLoading: v }),

  applyRealtimeEvent: (event, row) =>
    set((state) => {
      const mapped = mapDbFlight(row);
      switch (event) {
        case "INSERT":
          // Keep sorted by scheduled_time
          return {
            flights: [...state.flights, mapped].sort((a, b) =>
              a.scheduled_time.localeCompare(b.scheduled_time)
            ),
          };
        case "UPDATE":
          return {
            flights: state.flights.map((f) => (f.id === row.id ? mapped : f)),
          };
        case "DELETE":
          return { flights: state.flights.filter((f) => f.id !== row.id) };
      }
    }),
}));
