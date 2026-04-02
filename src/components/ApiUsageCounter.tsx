"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface Usage {
  used: number;
  limit: number;
}

export function ApiUsageCounter() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch("/api/stats/api-usage")
      .then((r) => r.json())
      .then((data: Usage) => setUsage(data))
      .catch(() => {});
  }, []);

  if (!usage) return null;

  const pct = Math.min((usage.used / usage.limit) * 100, 100);
  const isWarning = pct >= 80;
  const isCritical = pct >= 95;

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono
        ${isCritical
          ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
          : isWarning
          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-zinc-700 bg-zinc-900/60 text-zinc-400"
        }`}
      title={`Aviationstack API: ${usage.used}/${usage.limit} calls this month`}
    >
      <Activity className="w-3 h-3 flex-shrink-0" />
      <span className="tabular-nums">{usage.used}</span>
      <span className="text-zinc-600">/</span>
      <span className="tabular-nums text-zinc-500">{usage.limit}</span>
      {/* Mini bar */}
      <div className="w-12 h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all
            ${isCritical ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-[#39FF14]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
