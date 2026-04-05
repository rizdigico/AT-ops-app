"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { TopNav } from "@/components/TopNav";
import { FlightCard } from "@/components/FlightCard";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { useAppStore, mapDbFlight, DbFlight } from "@/store/useAppStore";
import { createClient } from "@/utils/supabase/client";
import {
  Radio, Loader2, Trash2, ArrowLeft, Search, X,
  PlaneLanding, PlaneTakeoff, Map,
} from "lucide-react";

const supabase = createClient();

type FilterType = "All" | "Arrival" | "Departure" | "Tour";

const TYPE_TABS: { id: FilterType; label: string; Icon?: React.FC<{ className?: string }>; accent: string }[] = [
  { id: "All",       label: "All",        accent: "#60a5fa" },
  { id: "Arrival",   label: "Arrivals",   Icon: PlaneLanding,  accent: "#4ade80" },
  { id: "Departure", label: "Departures", Icon: PlaneTakeoff, accent: "#60a5fa" },
  { id: "Tour",      label: "Tours",      Icon: Map,           accent: "#f59e0b" },
];

function dateChipLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+08:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function dateRangeString(dates: string[]): string {
  if (dates.length === 0) return "Singapore Changi · SGT (UTC+8)";
  const fmt = (s: string) => {
    const d = new Date(s + "T12:00:00+08:00");
    return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });
  };
  if (dates.length === 1) return `${fmt(dates[0])} · SGT (UTC+8)`;
  return `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])} · SGT (UTC+8)`;
}

export default function Home() {
  const [showUpload, setShowUpload] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeType, setActiveType] = useState<FilterType>("All");
  const [activeDate, setActiveDate] = useState<string>("All");

  const [clearStage, setClearStage] = useState<"idle" | "confirm" | "holding" | "clearing">("idle");
  const [holdProgress, setHoldProgress] = useState(0);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const flights        = useAppStore((s) => s.flights);
  const isLoading      = useAppStore((s) => s.isLoading);
  const setFlights     = useAppStore((s) => s.setFlights);
  const setLoading     = useAppStore((s) => s.setLoading);
  const applyRealtimeEvent = useAppStore((s) => s.applyRealtimeEvent);

  const fetchFlights = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("flights")
      .select("*")
      .order("scheduled_time", { ascending: true });
    if (error) console.error("[fetchFlights]", error.message);
    else setFlights((data as DbFlight[]).map(mapDbFlight));
    setLoading(false);
  }, [setFlights, setLoading]);

  useEffect(() => {
    fetchFlights();
    const channel = supabase
      .channel("flights-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "flights" }, (payload) => {
        applyRealtimeEvent(
          payload.eventType as "INSERT" | "UPDATE" | "DELETE",
          (payload.new ?? payload.old) as DbFlight
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchFlights, applyRealtimeEvent]);

  // ── Stats (all flights, not filtered) ────────────────────────────────────

  const stats = useMemo(() => ({
    total:      flights.length,
    arrivals:   flights.filter((f) => f.type === "Arrival").length,
    departures: flights.filter((f) => f.type === "Departure").length,
    tours:      flights.filter((f) => f.type === "Tour").length,
    completed:  flights.filter((f) => f.completed).length,
    cancelled:  flights.filter((f) => f.status === "Cancelled").length,
    pending:    flights.filter((f) => !f.completed && f.status !== "Cancelled").length,
  }), [flights]);

  // ── Unique dates in the data ──────────────────────────────────────────────

  const availableDates = useMemo(
    () => [...new Set(flights.map((f) => f.date))].sort(),
    [flights]
  );

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filteredFlights = useMemo(() => {
    let result = flights;
    if (activeType !== "All") result = result.filter((f) => f.type === activeType);
    if (activeDate !== "All") result = result.filter((f) => f.date === activeDate);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (f) =>
          f.pax_name.toLowerCase().includes(q) ||
          f.flight_number.toLowerCase().includes(q) ||
          f.driver_info.toLowerCase().includes(q) ||
          f.agent.toLowerCase().includes(q) ||
          f.file_ref.toLowerCase().includes(q)
      );
    }
    return result;
  }, [flights, activeType, activeDate, searchQuery]);

  // ── Clear logic ───────────────────────────────────────────────────────────

  const startHold = useCallback(() => {
    if (clearStage !== "confirm") return;
    setClearStage("holding");
    setHoldProgress(0);
    let elapsed = 0;
    holdInterval.current = setInterval(() => {
      elapsed += 50;
      const pct = Math.min((elapsed / 5000) * 100, 100);
      setHoldProgress(pct);
      if (elapsed >= 5000) {
        clearInterval(holdInterval.current!);
        holdInterval.current = null;
        setClearStage("clearing");
        fetch("/api/flights/clear", { method: "DELETE" })
          .then(() => fetchFlights())
          .finally(() => { setClearStage("idle"); setHoldProgress(0); });
      }
    }, 50);
  }, [clearStage, fetchFlights]);

  const cancelHold = useCallback(() => {
    if (holdInterval.current) { clearInterval(holdInterval.current); holdInterval.current = null; }
    if (clearStage === "holding") { setClearStage("confirm"); setHoldProgress(0); }
  }, [clearStage]);

  const resetClear = useCallback(() => {
    if (holdInterval.current) clearInterval(holdInterval.current);
    setClearStage("idle");
    setHoldProgress(0);
  }, []);

  // ── Upload overlay ────────────────────────────────────────────────────────

  if (showUpload) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <TopNav onUploadClick={() => setShowUpload(true)} onAfterSync={fetchFlights} />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
          <button
            onClick={() => setShowUpload(false)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-mono uppercase tracking-widest mb-6 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Back to Operations
          </button>
          <ScheduleUploader onSuccess={() => { fetchFlights(); setShowUpload(false); }} />
        </main>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopNav onUploadClick={() => setShowUpload(true)} onAfterSync={fetchFlights} />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-4">

        {/* ── Live status bar ── */}
        <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
          <span>{dateRangeString(availableDates)}</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span className="text-emerald-400 font-semibold">LIVE</span>
            <span className="text-zinc-600">· {flights.length} jobs</span>
          </div>
        </div>

        {/* ── Stats grid (7 columns) ── */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {([
            ["Total",      stats.total,      "#60a5fa"],
            ["Arrivals",   stats.arrivals,   "#4ade80"],
            ["Departures", stats.departures, "#60a5fa"],
            ["Tours",      stats.tours,      "#f59e0b"],
            ["Completed",  stats.completed,  "#4ade80"],
            ["Cancelled",  stats.cancelled,  "#f87171"],
            ["Pending",    stats.pending,    "#fbbf24"],
          ] as [string, number, string][]).map(([label, value, color]) => (
            <div
              key={label}
              className="rounded-xl p-2.5 text-center"
              style={{ background: "#111827", border: "1px solid #1f2937" }}
            >
              <div className="text-xl font-bold font-mono tabular-nums" style={{ color, lineHeight: 1 }}>
                {value}
              </div>
              <div className="text-[9px] text-zinc-500 mt-1.5 uppercase tracking-wider font-mono">
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search passenger · flight · driver · file ref · agent…"
            className="w-full rounded-lg pl-9 pr-8 py-2.5 text-xs font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none transition-colors"
            style={{ background: "#111827", border: "1px solid #1f2937" }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* ── Type tabs ── */}
        <div className="flex gap-2 flex-wrap">
          {TYPE_TABS.map(({ id, label, Icon, accent }) => {
            const active = activeType === id;
            const count = id === "All" ? stats.total
              : id === "Arrival" ? stats.arrivals
              : id === "Departure" ? stats.departures
              : stats.tours;
            return (
              <button
                key={id}
                onClick={() => setActiveType(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all"
                style={{
                  border: `1px solid ${active ? accent : "#374151"}`,
                  background: active ? accent + "22" : "transparent",
                  color: active ? accent : "#6b7280",
                }}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {label}
                <span
                  className="rounded px-1 text-[10px]"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Date chips ── */}
        {availableDates.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveDate("All")}
              className="px-3 py-1 rounded-full text-xs font-mono transition-all"
              style={{
                border: `1px solid ${activeDate === "All" ? "#4b5563" : "#1f2937"}`,
                background: activeDate === "All" ? "#1f2937" : "transparent",
                color: activeDate === "All" ? "#f1f5f9" : "#6b7280",
                fontWeight: activeDate === "All" ? 600 : 400,
              }}
            >
              All Dates
            </button>
            {availableDates.map((d) => {
              const cnt = flights.filter((f) => f.date === d).length;
              const active = activeDate === d;
              return (
                <button
                  key={d}
                  onClick={() => setActiveDate(active ? "All" : d)}
                  className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-mono transition-all"
                  style={{
                    border: `1px solid ${active ? "#4b5563" : "#1f2937"}`,
                    background: active ? "#1f2937" : "transparent",
                    color: active ? "#f1f5f9" : "#6b7280",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {dateChipLabel(d)}
                  <span className="text-[10px] text-blue-400">{cnt}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Results count ── */}
        {flights.length > 0 && (
          <div className="text-xs font-mono text-zinc-500">
            Showing{" "}
            <strong className="text-white">{filteredFlights.length}</strong>{" "}
            of {flights.length} jobs
            {searchQuery && (
              <> · <em className="text-blue-300 not-italic">"{searchQuery}"</em></>
            )}
          </div>
        )}

        {/* ── Cards ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-mono">Fetching live data…</span>
          </div>
        ) : flights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-3">
            <Radio className="w-7 h-7" />
            <p className="text-sm">Nothing here.</p>
            <button
              onClick={() => setShowUpload(true)}
              className="text-xs text-[#00f3ff] hover:underline font-mono"
            >
              Upload a schedule →
            </button>
          </div>
        ) : filteredFlights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-3">
            <Search className="w-7 h-7" />
            <p className="text-sm">No jobs match your filters.</p>
            <button
              onClick={() => { setActiveType("All"); setActiveDate("All"); setSearchQuery(""); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-mono"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredFlights.map((f) => <FlightCard key={f.id} {...f} />)}
          </div>
        )}

        {/* ── Footer ── */}
        {flights.length > 0 && (
          <div
            className="text-center text-[11px] text-zinc-600 font-mono pt-4"
            style={{ borderTop: "1px solid #1f2937" }}
          >
            LAT Ops Flight Monitor · {flights.length} jobs · All times SGT (UTC+8)
          </div>
        )}

        {/* ── Clear All Data ── */}
        {flights.length > 0 && (
          <div className="mb-2 flex flex-col items-center gap-3">
            {clearStage === "idle" && (
              <button
                onClick={() => setClearStage("confirm")}
                className="flex items-center gap-2 text-xs text-zinc-600 hover:text-red-400 font-mono uppercase tracking-widest transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear All Data
              </button>
            )}

            {(clearStage === "confirm" || clearStage === "holding") && (
              <div className="w-full max-w-xs flex flex-col items-center gap-3">
                <p className="text-xs text-zinc-400 font-mono text-center">
                  {clearStage === "confirm"
                    ? "This will delete all flight records. Hold the button for 5s to confirm."
                    : "Keep holding…"}
                </p>
                <div
                  className="relative w-full h-10 rounded-lg overflow-hidden cursor-pointer select-none"
                  style={{ border: "1px solid rgba(127,29,29,0.6)" }}
                  onMouseDown={startHold}
                  onMouseUp={cancelHold}
                  onMouseLeave={cancelHold}
                  onTouchStart={startHold}
                  onTouchEnd={cancelHold}
                >
                  <div
                    className="absolute inset-y-0 left-0 transition-none"
                    style={{ width: `${holdProgress}%`, background: "rgba(127,29,29,0.6)" }}
                  />
                  <div className="relative z-10 flex items-center justify-center h-full gap-2 text-xs font-mono uppercase tracking-widest text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                    {clearStage === "confirm"
                      ? "Hold to Delete All"
                      : `Deleting… ${Math.round(holdProgress)}%`}
                  </div>
                </div>
                <button
                  onClick={resetClear}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 font-mono uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {clearStage === "clearing" && (
              <div className="flex items-center gap-2 text-xs text-red-400 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Clearing database…
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
