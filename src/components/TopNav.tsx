"use client";

import { useEffect, useState, useCallback } from "react";
import { Plane, Menu, Bell, BellOff, UploadCloud } from "lucide-react";

interface TopNavProps {
  onUploadClick?: () => void;
}

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
  } catch {
    return false;
  }
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
  } catch {
    return false;
  }
}

export function TopNav({ onUploadClick }: TopNavProps) {
  const [time, setTime] = useState<string>("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  useEffect(() => {
    const updateClock = () => {
      const formatter = new Intl.DateTimeFormat("en-SG", {
        timeZone: "Asia/Singapore",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setTime(formatter.format(new Date()) + " SGT");
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check if push is already subscribed
  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (!supported) return;

    navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
      if (!reg) return;
      reg.pushManager.getSubscription().then((sub) => {
        setPushEnabled(!!sub);
      });
    });
  }, []);

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

  return (
    <nav className="sticky top-0 z-50 w-full glass border-b border-card-border/50 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white text-black p-1.5 rounded-md">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-tight leading-none text-white">AT Dispatch</h1>
            <p className="text-[10px] text-zinc-400 mt-0.5 tracking-wider uppercase font-mono">Command Center</p>
          </div>

          {/* Upload icon — sits right beside the title */}
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

        <div className="flex items-center gap-3">
          {time && (
            <div className="hidden sm:block font-mono text-xs tabular-nums text-zinc-300 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700">
              {time}
            </div>
          )}

          {/* Push notification bell */}
          {pushSupported && (
            <div className="relative group">
              <button
                onClick={togglePush}
                disabled={pushLoading}
                className={`relative p-2 transition-colors ${
                  pushEnabled ? "text-[#39FF14]" : "text-zinc-400 hover:text-white"
                } ${pushLoading ? "opacity-50 cursor-wait" : ""}`}
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

          <button className="p-2 text-zinc-400 hover:text-white transition-colors">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>
      {time && (
        <div className="sm:hidden flex justify-between items-center mt-3 pt-3 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Live System Time</span>
          <span className="font-mono text-xs tabular-nums text-[#39FF14]">{time}</span>
        </div>
      )}
    </nav>
  );
}
