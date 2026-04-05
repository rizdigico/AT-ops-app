"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plane, Menu, Bell, BellOff, UploadCloud, X,
  Activity, Download, Info, Wifi, WifiOff,
  CheckCircle2, AlertTriangle, RotateCcw, Loader2,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Flight } from "@/store/useAppStore";

interface TopNavProps {
  onUploadClick?: () => void;
  onAfterSync?: () => void;
}

// ── Push helpers ──────────────────────────────────────────────────────────────

async function registerPush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const reg = await navigator.serviceWorker.register("/sw.js");
    const keyRes = await fetch("/api/push/vapid-key");
    if (!keyRes.ok) return false;
    const { publicKey } = await keyRes.json() as { publicKey: string };
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    return true;
  } catch { return false; }
}

async function unregisterPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return true;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    return true;
  } catch { return false; }
}

// ── CSV export helper ─────────────────────────────────────────────────────────

function exportAllCsv(flights: Flight[]) {
  const header = "Date,Type,Pax Name,Pax Count,Flight,Agent,Terminal,Time,Status,Driver,Completed,Notes";
  const rows = flights.map((f) =>
    [
      f.date, f.type,
      `"${f.pax_name.replace(/"/g, '""')}"`,
      f.pax_count, f.flight_number, f.agent, f.terminal,
      f.scheduled_time, f.status,
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
  a.download = `AT_Ops_All_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Queue item type ────────────────────────────────────────────────────────────

interface QueueFlight {
  id: string;
  pax_name: string;
  type: string;
  flight_number: string | null;
  driver_info: string | null;
  terminal: string | null;
  file_ref: string;
  services: string | null;
  sgtTime: string;
  sgtDate: string;
  minsUntil: number;
  isDue: boolean;
}

function minsUntilLabel(mins: number): string {
  if (mins <= 0) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TopNav({ onUploadClick, onAfterSync }: TopNavProps) {
  const flights = useAppStore((s) => s.flights);

  const [time, setTime] = useState<string>("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  // Drawer
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Notification queue state
  const [queue, setQueue] = useState<QueueFlight[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<{ pax_name: string; time: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // API usage
  const [apiUsage, setApiUsage] = useState<{ used: number; limit: number } | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [realtimeOk, setRealtimeOk] = useState(true);

  // Live clock
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const tick = () => setTime(fmt.format(new Date()) + " SGT");
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Push subscription check
  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (!supported) return;
    navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
      if (!reg) return;
      reg.pushManager.getSubscription().then((sub) => setPushEnabled(!!sub));
    });
  }, []);

  // Realtime heartbeat
  useEffect(() => { setRealtimeOk(true); }, [flights]);

  // Fetch notification queue
  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await fetch("/api/notify/queue");
      const data = await res.json() as { flights?: QueueFlight[]; error?: string };
      if (data.flights) setQueue(data.flights);
    } catch {
      // silent — queue just stays stale
    } finally {
      setQueueLoading(false);
    }
  }, []);

  // Fetch API usage
  const fetchApiUsage = useCallback(async () => {
    setApiLoading(true);
    fetch("/api/stats/api-usage")
      .then((r) => r.json())
      .then((d: { used: number; limit: number }) => setApiUsage(d))
      .catch(() => {})
      .finally(() => setApiLoading(false));
  }, []);

  // Load data when drawer opens
  useEffect(() => {
    if (!menuOpen) return;
    fetchQueue();
    fetchApiUsage();
  }, [menuOpen, fetchQueue, fetchApiUsage]);

  // Close drawer on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const togglePush = useCallback(async () => {
    if (pushLoading) return;
    setPushLoading(true);
    if (pushEnabled) {
      const ok = await unregisterPush();
      if (ok) setPushEnabled(false);
    } else {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushLoading(false); return; }
      const ok = await registerPush();
      if (ok) setPushEnabled(true);
    }
    setPushLoading(false);
  }, [pushEnabled, pushLoading]);

  // Send a specific flight notification
  const handleSendFlight = useCallback(async (flightId: string) => {
    if (sendingId) return;
    setSendingId(flightId);
    setSendError(null);
    try {
      const res = await fetch("/api/notify/send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightId }),
      });
      const data = await res.json() as {
        success: boolean;
        sent?: number;
        remaining?: number;
        flight?: { pax_name: string };
        error?: string;
      };
      if (data.success && (data.sent ?? 0) > 0) {
        const nowStr = new Date().toLocaleTimeString("en-SG", {
          timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false,
        });
        setLastSent({ pax_name: data.flight?.pax_name ?? "flight", time: nowStr });
        onAfterSync?.();
        await fetchQueue();
      } else {
        setSendError(data.error ?? "Send failed — no message delivered");
      }
    } catch {
      setSendError("Network error — check connection");
    } finally {
      setSendingId(null);
    }
  }, [sendingId, fetchQueue, onAfterSync]);

  // Reset all notification flags
  const handleReset = useCallback(async () => {
    if (resetting) return;
    setResetting(true);
    setSendError(null);
    try {
      const res = await fetch("/api/notify/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json() as { success?: boolean; reset?: number; error?: string };
      if (data.success) {
        setLastSent(null);
        await fetchQueue();
      } else {
        setSendError(data.error ?? "Reset failed");
      }
    } catch {
      setSendError("Network error during reset");
    } finally {
      setResetting(false);
    }
  }, [resetting, fetchQueue]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const apiPct      = apiUsage ? Math.min((apiUsage.used / apiUsage.limit) * 100, 100) : 0;
  const apiCritical = apiPct >= 95;
  const apiWarning  = apiPct >= 80;
  const totalFlights = flights.length;
  const todaySGT = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const todayCount = flights.filter((f) => f.date === todaySGT).length;
  const dueCount = queue.filter((q) => q.isDue).length;

  return (
    <>
      <nav className="sticky top-0 z-50 w-full glass border-b border-card-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: brand + upload */}
          <div className="flex items-center gap-3">
            <div className="bg-white text-black p-1.5 rounded-md">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-sm tracking-tight leading-none text-white">AT Dispatch</h1>
              <p className="text-[10px] text-zinc-400 mt-0.5 tracking-wider uppercase font-mono">Command Center</p>
            </div>
            <div className="relative group ml-1">
              <button
                onClick={onUploadClick}
                className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                aria-label="Upload schedule"
              >
                <UploadCloud className="w-4 h-4" />
              </button>
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-44 rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-[10px] text-zinc-300 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                <p className="font-semibold text-white mb-0.5">Upload Schedule</p>
                Accepts weekly <span className="text-[#00f3ff]">.xlsx</span> or <span className="text-[#00f3ff]">.csv</span> transfer files
              </div>
            </div>
          </div>

          {/* Right: clock + push + menu */}
          <div className="flex items-center gap-3">
            {time && (
              <div className="hidden sm:block font-mono text-xs tabular-nums text-zinc-300 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700">
                {time}
              </div>
            )}
            {pushSupported && (
              <div className="relative group">
                <button
                  onClick={togglePush}
                  disabled={pushLoading}
                  className={`relative p-2 transition-colors ${pushEnabled ? "text-[#39FF14]" : "text-zinc-400 hover:text-white"} ${pushLoading ? "opacity-50 cursor-wait" : ""}`}
                  title={pushEnabled ? "Disable push alerts" : "Enable push alerts"}
                >
                  {pushEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                  {pushEnabled && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#39FF14] rounded-full border border-background" />
                  )}
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 w-40 rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-[10px] text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl">
                  {pushEnabled ? "Push alerts ON — click to disable" : "Click to enable OS push alerts"}
                </div>
              </div>
            )}
            <button
              onClick={() => setMenuOpen(true)}
              className="relative p-2 text-zinc-400 hover:text-white transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
              {/* Badge for due notifications */}
              {dueCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile clock row */}
        {time && (
          <div className="sm:hidden flex justify-between items-center mt-3 pt-3 border-t border-white/5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Live System Time</span>
            <span className="font-mono text-xs tabular-nums text-[#39FF14]">{time}</span>
          </div>
        )}
      </nav>

      {/* ── Drawer ─────────────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />

          <div
            ref={drawerRef}
            className="relative z-10 w-80 h-full bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-semibold text-white tracking-tight">Operations</span>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

              {/* ── Overview ── */}
              <section>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold mb-3">Overview</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Total Jobs</p>
                    <p className="text-xl font-bold font-mono text-white tabular-nums">{totalFlights}</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Today</p>
                    <p className="text-xl font-bold font-mono text-[#39FF14] tabular-nums">{todayCount}</p>
                  </div>
                </div>
              </section>

              {/* ── WhatsApp Notification Queue ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold">
                    WhatsApp Queue
                    {queue.length > 0 && (
                      <span className="ml-2 text-zinc-600">· {queue.length} pending</span>
                    )}
                    {dueCount > 0 && (
                      <span className="ml-1.5 text-amber-400 animate-pulse">· {dueCount} DUE</span>
                    )}
                  </p>
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    title="Reset notification flags — re-arms all upcoming flights"
                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 font-mono transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3 h-3 ${resetting ? "animate-spin" : ""}`} />
                    Reset All
                  </button>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  {queueLoading ? (
                    <div className="flex items-center gap-2 px-4 py-4 text-xs text-zinc-500 font-mono">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading queue…
                    </div>
                  ) : queue.length === 0 ? (
                    <div className="flex items-center gap-2 px-4 py-4 text-xs text-[#39FF14] font-mono">
                      <CheckCircle2 className="w-4 h-4" />
                      All caught up! No pending notifications.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800 max-h-72 overflow-y-auto">
                      {queue.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between px-3 py-2.5 gap-3"
                          style={{ background: f.isDue ? "rgba(120,53,15,0.15)" : "transparent" }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-white truncate leading-snug">
                              {f.pax_name}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              {f.type === "Arrival" ? "✈️" : f.type === "Tour" ? "🗺️" : "🚗"}{" "}
                              {f.sgtTime} · {f.sgtDate}
                              {f.driver_info && (
                                <span className="ml-1.5 text-zinc-600">· {f.driver_info.split(" ")[0]}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {f.isDue ? (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-950 border border-amber-900 px-1.5 py-0.5 rounded animate-pulse whitespace-nowrap">
                                DUE
                              </span>
                            ) : (
                              <span className="text-[10px] text-zinc-600 font-mono whitespace-nowrap">
                                in {minsUntilLabel(f.minsUntil)}
                              </span>
                            )}
                            <button
                              onClick={() => handleSendFlight(f.id)}
                              disabled={!!sendingId}
                              className={`text-[11px] font-mono font-bold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                                sendingId === f.id
                                  ? "bg-zinc-700 text-zinc-400 cursor-wait"
                                  : "bg-[#25D366] text-black hover:bg-[#1ebe5d]"
                              } disabled:opacity-50`}
                            >
                              {sendingId === f.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Send"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Status bar */}
                  {(lastSent || sendError) && (
                    <div className={`px-3 py-2 border-t border-zinc-800 text-[10px] font-mono flex items-start gap-2 ${sendError ? "text-rose-400" : "text-[#39FF14]"}`}>
                      {sendError
                        ? <><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /><span className="break-all">{sendError}</span></>
                        : <><CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /><span>Sent to <strong>{lastSent?.pax_name}</strong> @ {lastSent?.time}</span></>
                      }
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-zinc-600 font-mono mt-2 leading-relaxed">
                  Send notifications one by one. Flights marked <span className="text-amber-400">DUE</span> are within 1 hour of service start.
                  If flights are missing, press <em>Reset All</em> to re-arm the queue.
                </p>
              </section>

              {/* ── Aviationstack Quota ── */}
              <section>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold mb-3">Aviationstack Quota</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                  {apiLoading ? (
                    <p className="text-xs text-zinc-500 font-mono">Loading…</p>
                  ) : apiUsage ? (
                    <>
                      <div className="flex items-end justify-between">
                        <span className={`text-2xl font-bold font-mono tabular-nums ${apiCritical ? "text-rose-400" : apiWarning ? "text-amber-400" : "text-white"}`}>
                          {apiUsage.used}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono mb-1">/ {apiUsage.limit} calls</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${apiCritical ? "bg-rose-500" : apiWarning ? "bg-amber-500" : "bg-[#39FF14]"}`}
                          style={{ width: `${apiPct}%` }}
                        />
                      </div>
                      <p className={`text-[10px] font-mono ${apiCritical ? "text-rose-400" : apiWarning ? "text-amber-400" : "text-zinc-500"}`}>
                        {apiPct.toFixed(1)}% used this month
                        {apiCritical && " — CRITICAL: nearly exhausted"}
                        {!apiCritical && apiWarning && " — approaching limit"}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-500 font-mono">Unavailable</p>
                  )}
                </div>
              </section>

              {/* ── Export ── */}
              <section>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold mb-3">Data Export</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                  <p className="text-xs text-zinc-400">
                    Download all {totalFlights} jobs as CSV.
                  </p>
                  <button
                    onClick={() => exportAllCsv(flights)}
                    disabled={totalFlights === 0}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export All Flights
                  </button>
                </div>
              </section>

              {/* ── System Status ── */}
              <section>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold mb-3">System</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                      {realtimeOk ? <Wifi className="w-3.5 h-3.5 text-[#39FF14]" /> : <WifiOff className="w-3.5 h-3.5 text-rose-400" />}
                      Realtime Feed
                    </div>
                    <span className={`text-[10px] font-mono font-semibold ${realtimeOk ? "text-[#39FF14]" : "text-rose-400"}`}>
                      {realtimeOk ? "LIVE" : "OFFLINE"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                      <Bell className="w-3.5 h-3.5 text-zinc-500" />
                      Push Alerts
                    </div>
                    <button
                      onClick={togglePush}
                      disabled={pushLoading || !pushSupported}
                      className={`text-[10px] font-mono font-semibold transition-colors ${pushEnabled ? "text-[#39FF14] hover:text-zinc-400" : "text-zinc-500 hover:text-zinc-300"} disabled:opacity-40`}
                    >
                      {!pushSupported ? "NOT SUPPORTED" : pushLoading ? "…" : pushEnabled ? "ON · disable" : "OFF · enable"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                      <Activity className="w-3.5 h-3.5 text-zinc-500" />
                      Cron Schedule
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">every 15 min</span>
                  </div>
                </div>
              </section>

              {/* ── About ── */}
              <section>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold mb-3">About</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-white text-black p-1 rounded">
                      <Plane className="w-3 h-3" />
                    </div>
                    <span className="text-sm font-semibold text-white">AT Dispatch</span>
                  </div>
                  <p className="text-[10px] font-mono text-zinc-500 leading-relaxed">
                    Airport Transfer Operations Command Centre.<br />
                    Powered by CallMeBot · Supabase · Next.js · Vercel.
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600">
                    <Info className="w-3 h-3" />
                    No authentication — internal ops tool
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
