"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { TopNav } from "@/components/TopNav";
import { StatsRow } from "@/components/StatsRow";
import { FlightCard } from "@/components/FlightCard";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { WeeklyStrip } from "@/components/WeeklyStrip";
import { ApiUsageCounter } from "@/components/ApiUsageCounter";
import { useAppStore, mapDbFlight, DbFlight, Flight, TabId } from "@/store/useAppStore";
import { createClient } from "@/utils/supabase/client";
import {
  Radio, Loader2, Trash2, ArrowLeft,
  CalendarDays, Clock, History, AlertTriangle, XCircle,
  Search, X, Download,
} from "lucide-react";

const supabase = createClient();

const TABS: { id: TabId; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "today",     label: "Today",     Icon: CalendarDays   },
  { id: "upcoming",  label: "Upcoming",  Icon: Clock          },
  { id: "past",      label: "Past",      Icon: History        },
  { id: "delayed",   label: "Delayed",   Icon: AlertTriangle  },
  { id: "cancelled", label: "Cancelled", Icon: XCircle        },
];

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+08:00");
  return d.toLocaleDateString("en-SG", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "Asia/Singapore",
  });
}

function DayGroup({ date, flights, isPast }: { date: string; flights: Flight[]; isPast?: boolean }) {
  return (
    <div id={`date-group-${date}`} className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold">
          {formatDayLabel(date)}
        </span>
        <span className="text-[10px] text-zinc-700 font-mono">· {flights.length}</span>
        <div className="flex-1 h-px bg-zinc-800 ml-1" />
      </div>
      {flights.map((f) => <FlightCard key={f.id} {...f} isPast={isPast} />)}
    </div>
  );
}

function EmptyTab({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-3">
      <Radio className="w-7 h-7" />
      <p className="text-sm">Nothing here.</p>
      <button onClick={onUpload} className="text-xs text-[#00f3ff] hover:underline font-mono">
        Upload a schedule →
      </button>
    </div>
  );
}

function exportCsv(flights: Flight[], label: string) {
  const header = "Date,Type,Pax Name,Pax Count,Flight,Agent,Terminal,Time,Status,Driver,Completed,Notes";
  const rows = flights.map((f) =>
    [
      f.date,
      f.type,
      `"${f.pax_name.replace(/"/g, '""')}"`,
      f.pax_count,
      f.flight_number,
      f.agent,
      f.terminal,
      f.scheduled_time,
      f.status,
      `"${(f.driver_info ?? "").replace(/"/g, '""')}"`,
      f.completed ? "Yes" : "No",
      `"${(f.notes ?? "").replace(/"/g, '""')}"`,
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `AT_Ops_${label}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [showUpload, setShowUpload] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [clearStage, setClearStage] = useState<"idle" | "confirm" | "holding" | "clearing">("idle");
  const [holdProgress, setHoldProgress] = useState(0);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const flights        = useAppStore((s) => s.flights);
  const isLoading      = useAppStore((s) => s.isLoading);
  const activeTab      = useAppStore((s) => s.activeTab);
  const setActiveTab   = useAppStore((s) => s.setActiveTab);
  const setFlights     = useAppStore((s) => s.setFlights);
  const setLoading     = useAppStore((s) => s.setLoading);
  const applyRealtimeEvent = useAppStore((s) => s.applyRealtimeEvent);

  // Scroll to a specific date group after the tab has rendered
  useEffect(() => {
    if (!selectedDate) return;
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = document.getElementById(`date-group-${selectedDate}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        setSelectedDate(null);
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [selectedDate, activeTab]);

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
        applyRealtimeEvent(payload.eventType as "INSERT" | "UPDATE" | "DELETE",
          (payload.new ?? payload.old) as DbFlight);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchFlights, applyRealtimeEvent]);

  // ── Search filter ─────────────────────────────────────────────────────────

  const filteredFlights = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return flights;
    return flights.filter(
      (f) =>
        f.pax_name.toLowerCase().includes(q) ||
        f.flight_number.toLowerCase().includes(q) ||
        f.driver_info.toLowerCase().includes(q) ||
        f.agent.toLowerCase().includes(q)
    );
  }, [flights, searchQuery]);

  // ── Partition flights into tab buckets ────────────────────────────────────

  const buckets = useMemo(() => {
    const sgt = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const nowMs = Date.now();

    const today: Flight[]     = [];
    const upcoming: Flight[]  = [];
    const past: Flight[]      = [];
    const delayed: Flight[]   = [];
    const cancelled: Flight[] = [];

    for (const f of filteredFlights) {
      if (f.status === "Delayed")   { delayed.push(f);   continue; }
      if (f.status === "Cancelled") { cancelled.push(f); continue; }

      if (f.date < sgt)       past.push(f);
      else if (f.date === sgt) today.push(f);
      else                     upcoming.push(f);
    }

    const upcomingByDate = new Map<string, Flight[]>();
    for (const f of upcoming) {
      const arr = upcomingByDate.get(f.date) ?? [];
      arr.push(f);
      upcomingByDate.set(f.date, arr);
    }

    const pastByDate = new Map<string, Flight[]>();
    for (const f of past) {
      const arr = pastByDate.get(f.date) ?? [];
      arr.push(f);
      pastByDate.set(f.date, arr);
    }

    const todayUpcoming  = today.filter((f) => new Date(f.scheduledISO).getTime() > nowMs);
    const todayCompleted = today.filter((f) => new Date(f.scheduledISO).getTime() <= nowMs);

    return {
      sgt,
      today,
      todayUpcoming,
      todayCompleted,
      upcomingGroups: [...upcomingByDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, fs]) => ({ date, flights: fs })),
      pastGroups: [...pastByDate.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, fs]) => ({ date, flights: fs })),
      delayed,
      cancelled,
    };
  }, [filteredFlights]);

  const counts: Record<TabId, number> = {
    today:     buckets.today.length,
    upcoming:  buckets.upcomingGroups.reduce((n, g) => n + g.flights.length, 0),
    past:      buckets.pastGroups.reduce((n, g)     => n + g.flights.length, 0),
    delayed:   buckets.delayed.length,
    cancelled: buckets.cancelled.length,
  };

  // Active tab's full flat list (for export)
  const activeFlights = useMemo(() => {
    switch (activeTab) {
      case "today":     return buckets.today;
      case "upcoming":  return buckets.upcomingGroups.flatMap((g) => g.flights);
      case "past":      return buckets.pastGroups.flatMap((g) => g.flights);
      case "delayed":   return buckets.delayed;
      case "cancelled": return buckets.cancelled;
    }
  }, [activeTab, buckets]);

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

  // ── Upload overlay ─────────────────────────────────────────────────────────

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

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopNav onUploadClick={() => setShowUpload(true)} />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 flex flex-col">

        <StatsRow />

        {/* ── Weekly overview strip ── */}
        <WeeklyStrip
          flights={flights}
          onDayClick={(date) => {
            const sgt = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
            if (date === sgt) setActiveTab("today");
            else if (date > sgt) setActiveTab("upcoming");
            else setActiveTab("past");
            setSelectedDate(date);
          }}
        />

        {/* ── Search bar + Export ── */}
        {flights.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pax, flight, driver…"
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg pl-9 pr-8 py-2 text-xs font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
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
            {activeFlights.length > 0 && (
              <button
                onClick={() => exportCsv(activeFlights, activeTab)}
                title="Export current view as CSV"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}
            <ApiUsageCounter />
          </div>
        )}

        {/* ── Tab bar ── */}
        <div className="flex gap-1.5 flex-wrap mb-6 p-1 rounded-xl bg-zinc-900/60 border border-zinc-800">
          {TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            const count  = counts[id];
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono font-medium transition-all flex-1 justify-center
                  ${active
                    ? "bg-white text-black shadow"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums
                      ${active ? "bg-black/10 text-black" : "bg-zinc-800 text-zinc-400"}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-mono">Fetching live data…</span>
          </div>
        ) : (
          <div className="flex-1">

            {/* TODAY */}
            {activeTab === "today" && (
              buckets.today.length === 0 ? (
                <EmptyTab onUpload={() => setShowUpload(true)} />
              ) : (
                <>
                  {buckets.todayUpcoming.length > 0 && (
                    <DayGroup
                      date={buckets.sgt}
                      flights={buckets.todayUpcoming}
                    />
                  )}
                  {buckets.todayCompleted.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono font-semibold">
                          Completed
                        </span>
                        <span className="text-[10px] text-zinc-700 font-mono">· {buckets.todayCompleted.length}</span>
                        <div className="flex-1 h-px bg-zinc-800 ml-1" />
                      </div>
                      {buckets.todayCompleted.map((f) => <FlightCard key={f.id} {...f} isPast />)}
                    </div>
                  )}
                </>
              )
            )}

            {/* UPCOMING */}
            {activeTab === "upcoming" && (
              buckets.upcomingGroups.length === 0 ? (
                <EmptyTab onUpload={() => setShowUpload(true)} />
              ) : (
                buckets.upcomingGroups.map(({ date, flights }) => (
                  <DayGroup key={date} date={date} flights={flights} />
                ))
              )
            )}

            {/* PAST */}
            {activeTab === "past" && (
              buckets.pastGroups.length === 0 ? (
                <EmptyTab onUpload={() => setShowUpload(true)} />
              ) : (
                buckets.pastGroups.map(({ date, flights }) => (
                  <DayGroup key={date} date={date} flights={flights} isPast />
                ))
              )
            )}

            {/* DELAYED */}
            {activeTab === "delayed" && (
              buckets.delayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-3">
                  <AlertTriangle className="w-7 h-7" />
                  <p className="text-sm">No delayed transfers.</p>
                </div>
              ) : (
                buckets.delayed.map((f) => <FlightCard key={f.id} {...f} />)
              )
            )}

            {/* CANCELLED */}
            {activeTab === "cancelled" && (
              buckets.cancelled.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-3">
                  <XCircle className="w-7 h-7" />
                  <p className="text-sm">No cancelled transfers.</p>
                </div>
              ) : (
                buckets.cancelled.map((f) => <FlightCard key={f.id} {...f} />)
              )
            )}

          </div>
        )}

        {/* ── Clear All Data ── */}
        {flights.length > 0 && (
          <div className="mt-10 mb-2 flex flex-col items-center gap-3">

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
                  className="relative w-full h-10 rounded-lg overflow-hidden border border-red-900/60 cursor-pointer select-none"
                  onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
                  onTouchStart={startHold} onTouchEnd={cancelHold}
                >
                  <div className="absolute inset-y-0 left-0 bg-red-900/60 transition-none" style={{ width: `${holdProgress}%` }} />
                  <div className="relative z-10 flex items-center justify-center h-full gap-2 text-xs font-mono uppercase tracking-widest text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                    {clearStage === "confirm" ? "Hold to Delete All" : `Deleting… ${Math.round(holdProgress)}%`}
                  </div>
                </div>
                <button onClick={resetClear} className="text-[10px] text-zinc-600 hover:text-zinc-400 font-mono uppercase tracking-widest transition-colors">
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
