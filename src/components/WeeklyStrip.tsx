"use client";

import { useMemo } from "react";
import type { Flight } from "@/store/useAppStore";

interface WeeklyStripProps {
  flights: Flight[];
  onDayClick?: (date: string) => void;
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeeklyStrip({ flights, onDayClick }: WeeklyStripProps) {
  const days = useMemo(() => {
    if (flights.length === 0) return [];

    const sgt = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

    // Collect all unique dates present in the data
    const dateCounts = new Map<string, number>();
    for (const f of flights) {
      dateCounts.set(f.date, (dateCounts.get(f.date) ?? 0) + 1);
    }

    // Sort dates and return enriched entries
    return [...dateCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => {
        const d = new Date(date + "T12:00:00+08:00");
        return {
          date,
          count,
          dayAbbr: DAY_ABBR[d.getDay()],
          dayNum: d.getDate(),
          isToday: date === sgt,
          isPast: date < sgt,
        };
      });
  }, [flights]);

  if (days.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 scrollbar-none">
      {days.map(({ date, count, dayAbbr, dayNum, isToday, isPast }) => (
        <button
          key={date}
          onClick={() => onDayClick?.(date)}
          className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border min-w-[52px] transition-all flex-shrink-0
            ${isToday
              ? "border-[#39FF14]/40 bg-[#39FF14]/10 text-[#39FF14]"
              : isPast
              ? "border-zinc-800 bg-zinc-900/40 text-zinc-600 hover:text-zinc-400"
              : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500"
            }`}
        >
          <span className="text-[9px] uppercase tracking-widest font-mono font-semibold">
            {dayAbbr}
          </span>
          <span className={`text-sm font-bold font-mono leading-none ${isToday ? "text-[#39FF14]" : ""}`}>
            {dayNum}
          </span>
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full tabular-nums
              ${isToday
                ? "bg-[#39FF14]/20 text-[#39FF14]"
                : isPast
                ? "bg-zinc-800 text-zinc-600"
                : "bg-zinc-800 text-zinc-400"
              }`}
          >
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}
