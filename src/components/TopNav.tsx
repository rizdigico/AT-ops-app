"use client";

import { useEffect, useState } from "react";
import { Plane, Menu, Bell } from "lucide-react";

export function TopNav() {
  const [time, setTime] = useState<string>("");

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
        </div>

        <div className="flex items-center gap-3">
          {time && (
            <div className="hidden sm:block font-mono text-xs tabular-nums text-zinc-300 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700">
              {time}
            </div>
          )}
          <button className="relative p-2 text-zinc-400 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse border border-background"></span>
          </button>
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
