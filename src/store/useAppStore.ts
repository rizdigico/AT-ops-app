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
  scheduledISO: string;     // raw UTC ISO from DB — used for date comparisons
  scheduled_time: string;   // formatted HH:MM SGT
  updated_time?: string;    // formatted HH:MM SGT, present when delayed
  driver_info: string;
  notified: boolean;
  status: TransferStatus;
  completed: boolean;
  notes: string | null;
  status_override: "Delayed" | "Cancelled" | null;
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
  completed: boolean;
  notes: string | null;
  status_override: "Delayed" | "Cancelled" | null;
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
// - status_override takes highest precedence
// - updated_time set + ≥15 min diff → Delayed
export function mapDbFlight(row: DbFlight): Flight {
  let status: TransferStatus = "On Time";
  if (row.status_override === "Cancelled") {
    status = "Cancelled";
  } else if (row.status_override === "Delayed") {
    status = "Delayed";
  } else if (row.updated_time) {
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
    scheduledISO: row.scheduled_time,
    scheduled_time: fmtTime(row.scheduled_time),
    updated_time: row.updated_time ? fmtTime(row.updated_time) : undefined,
    driver_info: row.driver_info ?? "",
    notified: row.notified,
    status,
    completed: row.completed ?? false,
    notes: row.notes ?? null,
    status_override: row.status_override ?? null,
  };
}

interface AppState {
  flights: Flight[];
  isLoading: boolean;
  isDeployed: boolean;
  setFlights: (flights: Flight[]) => void;
  setLoading: (v: boolean) => void;
  setIsDeployed: (v: boolean) => void;
  applyRealtimeEvent: (event: "INSERT" | "UPDATE" | "DELETE", row: DbFlight) => void;
}

export const useAppStore = create<AppState>((set) => ({
  flights: [],
  isLoading: true,
  isDeployed: false,

  setFlights: (flights) => set({ flights }),
  setLoading: (v) => set({ isLoading: v }),
  setIsDeployed: (v) => set({ isDeployed: v }),

  applyRealtimeEvent: (event, row) =>
    set((state) => {
      const mapped = mapDbFlight(row);
      switch (event) {
        case "INSERT":
          // Keep sorted by raw ISO so multi-day ordering is correct
          return {
            flights: [...state.flights, mapped].sort((a, b) =>
              a.scheduledISO.localeCompare(b.scheduledISO)
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
