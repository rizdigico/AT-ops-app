"use client";

import { PlaneLanding, PlaneTakeoff, Users, Car, MapPin, MessageCircle } from "lucide-react";
import type { Flight } from "@/store/useAppStore";

export function FlightCard({
  pax_name,
  pax_count,
  flight_number,
  agent,
  terminal,
  driver_info,
  scheduled_time,
  updated_time,
  status,
  type,
  notified,
  isPast = false,
}: Flight & { isPast?: boolean }) {
  const isDelayed = status === "Delayed";
  const isCancelled = status === "Cancelled";

  const statusStyle = {
    "On Time": "text-[#39FF14] bg-[#39FF14]/10 border-[#39FF14]/30",
    Delayed: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    Cancelled: "text-rose-500 bg-rose-500/10 border-rose-500/30",
  }[status];

  const statusDot = { "On Time": "\u{1F7E2}", Delayed: "\u{1F7E1}", Cancelled: "\u{1F534}" }[status];

  const borderLeft = {
    "On Time": "border-l-[#39FF14]/50",
    Delayed: "border-l-amber-500/50",
    Cancelled: "border-l-rose-500/50",
  }[status];

  return (
    <div
      className={`glass-card p-4 rounded-xl mb-3 border border-card-border border-l-4 ${borderLeft} hover:bg-white/5 transition-colors ${isPast ? "opacity-40" : ""}`}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs font-medium text-zinc-300">
            {type === "Arrival" ? (
              <PlaneLanding className="w-4 h-4 text-blue-400" />
            ) : (
              <PlaneTakeoff className="w-4 h-4 text-purple-400" />
            )}
            {type === "Arrival" ? "Airport Pickup" : "Hotel Transfer"}
          </div>
          <span className="text-zinc-500 text-xs font-mono">
            {flight_number} &middot; {agent}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {notified && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#39FF14]/10 border border-[#39FF14]/20 text-xs font-medium text-[#39FF14]">
              <MessageCircle className="w-3 h-3" />
              <span className="hidden sm:inline">Notified</span>
            </div>
          )}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono tracking-wider uppercase border ${statusStyle} ${
              isDelayed ? "animate-pulse" : ""
            }`}
          >
            <span className="text-[10px]">{statusDot}</span> {status}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">{pax_name}</h2>
          <div className="flex items-center gap-4 mt-1 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {pax_count} Pax
            </span>
            <span className="flex items-center gap-1 text-[#39FF14]">
              <Car className="w-3.5 h-3.5" /> {driver_info}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 text-zinc-300">
            <MapPin className="w-4 h-4 text-zinc-500" />
            <span className="font-mono text-sm bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700">
              {terminal}
            </span>
          </div>

          <div className="flex flex-col items-end">
            {isDelayed && updated_time ? (
              <>
                <span className="text-xs text-zinc-500 line-through font-mono">
                  {scheduled_time}
                </span>
                <span className="text-xl font-bold font-mono text-amber-500">
                  {updated_time}
                </span>
              </>
            ) : isCancelled ? (
              <span className="text-xl font-bold font-mono text-rose-500 line-through">
                {scheduled_time}
              </span>
            ) : (
              <span className="text-xl font-bold font-mono text-[#39FF14]">
                {scheduled_time}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
