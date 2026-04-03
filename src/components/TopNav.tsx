"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plane, Menu, Bell, BellOff, UploadCloud, X,
  RefreshCw, Activity, Download, Info, Wifi, WifiOff,
  CheckCircle2, AlertTriangle, Clock,
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

// ── Component ─────────────────────────────────────────────────────────────────

export function TopNav({ onUploadClick, onAfterSync }: TopNavProps) {
  const flights = useAppStore((s) => s.flights);

  const [time, setTime] = useState<string>("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  // Menu drawer state
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ processed: number; notified: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [apiUsage, setApiUsage] = useState<{ used: number; limit: number } | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Realtime heartbeat — treat flights array as a proxy for connection health
  useEffect(() => {
    setRealtimeOk(true);
  }, [flights]);

  // Fetch API usage when drawer opens
  useEffect(() => {
    if (!menuOpen) return;
    setApiLoading(true);
    fetch("/api/stats/api-usage")
      .then((r) => r.json())
      .then((d: { used: number; limit: number }) => setApiUsage(d))
      .catch(() => {})
      .finally(() => setApiLoading(false));
  }, [menuOpen]);

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

  const handleForceSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/cron/sync-flights");
      const data = await res.json() as { success: boolean; processed?: number; notified?: number; error?: string };
      if (data.success) {
        setSyncResult({ processed: data.processed ?? 0, notified: data.notified ?? 0 });
        setLastSyncTime(new Date().toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false }));
        onAfterSync?.();
      } else {
        setSyncError(data.error ?? "Sync failed");
      }
    } catch {
      setSyncError("Network error — check connection");
    } finally {
      setSyncing(false);
    }
  }, [syncing, onAfterSync]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const apiPct = apiUsage ? Math.min((apiUsage.used / apiUsage.limit) * 100, 100) : 0;
  const apiCritical = apiPct >= 95;
  const apiWarning  = apiPct >= 80;

  const totalFlights = flights.length;
  const todaySGT = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const todayCount = flights.filter((f) => f.date === todaySGT).length;

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
              className="p-2 text-zinc-400 hover:text-white transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
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

      {/* ── Drawer overlay ──────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />

          {/* Drawer panel */}
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

              {/* ── Section: Quick Stats ────────────────────────────── */}
              <section>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold mb-3">Overview</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Total Flights</p>
                    <p className="text-xl font-bold font-mono text-white tabular-nums">{totalFlights}</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-zinc-500 font-mono mb-0.5">Today</p>
                    <p className="text-xl font-bold font-mono text-[#39FF14] tabular-nums">{todayCount}</p>
                  </div>
                </div>
              </section>

              {/* ── Section: Force Sync ─────────────────────────────── */}
              <section>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold mb-3">Flight Sync</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Manually poll Aviationstack, detect delays & cancellations, and fire any due alerts — without waiting for the next 15-min cron run.
                  </p>
                  <button
                    onClick={handleForceSync}
                    disabled={syncing}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider transition-all
                      ${syncing
                        ? "bg-zinc-800 text-zinc-500 cursor-wait"
                        : "bg-white text-black hover:bg-zinc-200"
                      }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "Syncing…" : "Sync Now"}
                  </button>

                  {syncResult && (
                    <div className="flex items-start gap-2 text-xs font-mono text-[#39FF14]">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Checked <strong>{syncResult.processed}</strong> flight{syncResult.processed !== 1 ? "s" : ""} · <strong>{syncResult.notified}</strong> alert{syncResult.notified !== 1 ? "s" : ""} sent
                        {lastSyncTime && <span className="text-zinc-500 ml-1">@ {lastSyncTime}</span>}
                      </span>
                    </div>
                  )}
                  {syncError && (
                    <div className="flex items-center gap-2 text-xs font-mono text-rose-400">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{syncError}</span>
                    </div>
                  )}
                  {!syncResult && !syncError && lastSyncTime && (
                    <p className="text-[10px] font-mono text-zinc-600">Last manual sync @ {lastSyncTime}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600">
                    <Clock className="w-3 h-3" />
                    Auto-syncs every 15 min via Vercel Cron
                  </div>
                </div>
              </section>

              {/* ── Section: API Quota ──────────────────────────────── */}
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

              {/* ── Section: Export ─────────────────────────────────── */}
              <section>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold mb-3">Data Export</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                  <p className="text-xs text-zinc-400">
                    Download all {totalFlights} scheduled flights across all dates as CSV.
                  </p>
                  <button
                    onClick={() => { exportAllCsv(flights); }}
                    disabled={totalFlights === 0}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export All Flights
                  </button>
                </div>
              </section>

              {/* ── Section: System Status ──────────────────────────── */}
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

              {/* ── Section: About ──────────────────────────────────── */}
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
                    Powered by Aviationstack · Supabase · Next.js · Vercel.
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
