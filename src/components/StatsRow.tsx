"use client";

import { PlaneTakeoff, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export function StatsRow() {
  const flights = useAppStore((s) => s.flights);

  const total = flights.length;
  const onTime = flights.filter((f) => f.status === "On Time").length;
  const delayed = flights.filter((f) => f.status === "Delayed").length;
  const cancelled = flights.filter((f) => f.status === "Cancelled").length;

  const stats = [
    { label: "Total Transfers", value: total, icon: PlaneTakeoff, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
    { label: "On Time", value: onTime, icon: CheckCircle2, color: "text-[#39FF14]", bg: "bg-[#39FF14]/10", border: "border-[#39FF14]/20" },
    { label: "Delayed", value: delayed, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", pulse: delayed > 0 },
    { label: "Cancelled", value: cancelled, icon: XCircle, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {stats.map((s, i) => (
        <div key={i} className={`p-4 rounded-xl border ${s.border} glass-card flex items-center gap-3`}>
          <div className={`p-2.5 rounded-lg ${s.bg} ${s.color} ${s.pulse ? "animate-pulse" : ""}`}>
            <s.icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className="text-xl font-bold font-mono">{s.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
