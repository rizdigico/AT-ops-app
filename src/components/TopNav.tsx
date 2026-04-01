"use client";

import { useEffect, useState } from "react";
import { Plane, Menu, Bell, UploadCloud } from "lucide-react";

interface TopNavProps {
  onUploadClick?: () => void;
}

export function TopNav({ onUploadClick }: TopNavProps) {
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

          {/* Upload icon — sits right beside the title */}
          <div className="relative group ml-1">
            <button
              onClick={onUploadClick}
              className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Upload schedule"
            >
              <UploadCloud className="w-4 h-4" />
            </button>
            {/* Tooltip */}
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
