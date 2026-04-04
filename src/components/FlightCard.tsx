"use client";

import { useState, useRef, useEffect } from "react";
import {
  PlaneLanding, PlaneTakeoff, Users, Car, MapPin, MessageCircle,
  CheckCircle2, Circle, Copy, Check, ChevronDown, ChevronUp,
  AlertTriangle, XCircle, RotateCcw, FileText,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Flight } from "@/store/useAppStore";

type StatusOverride = "Delayed" | "Cancelled" | null;

export function FlightCard({
  id,
  file_ref,
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
  completed: initialCompleted,
  notes: initialNotes,
  status_override: initialStatusOverride,
  isPast = false,
}: Flight & { isPast?: boolean }) {
  const isDelayed = status === "Delayed";
  const isCancelled = status === "Cancelled";

  // ── Local optimistic state ────────────────────────────────────────────
  const [completed, setCompleted] = useState(initialCompleted);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [statusOverride, setStatusOverride] = useState<StatusOverride>(initialStatusOverride);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showNotes, setShowNotes] = useState(!!initialNotes);
  const [copied, setCopied] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const skipBlurRef = useRef(false);

  const updateFlightStatus = useAppStore((s) => s.updateFlightStatus);
  const updateFlightNotes  = useAppStore((s) => s.updateFlightNotes);

  // Sync local state when store/realtime updates props
  useEffect(() => {
    setStatusOverride(initialStatusOverride);
  }, [initialStatusOverride]);

  useEffect(() => {
    setNotes(initialNotes ?? "");
    setShowNotes(!!initialNotes);
  }, [initialNotes]);

  // Derive effective status after override
  const effectiveStatus = statusOverride ?? status;
  const effectiveIsDelayed = effectiveStatus === "Delayed";
  const effectiveIsCancelled = effectiveStatus === "Cancelled";

  const statusStyle = {
    "On Time": "text-[#39FF14] bg-[#39FF14]/10 border-[#39FF14]/30",
    Delayed: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    Cancelled: "text-rose-500 bg-rose-500/10 border-rose-500/30",
  }[effectiveStatus];

  const statusDot = { "On Time": "🟢", Delayed: "🟡", Cancelled: "🔴" }[effectiveStatus];

  const borderLeft = {
    "On Time": completed ? "border-l-zinc-600" : "border-l-[#39FF14]/50",
    Delayed: "border-l-amber-500/50",
    Cancelled: "border-l-rose-500/50",
  }[effectiveStatus];

  // ── API helpers ────────────────────────────────────────────────────────

  function toggleComplete() {
    const next = !completed;
    setCompleted(next);
    fetch(`/api/flights/${id}/complete`, { method: "PATCH" }).catch(() =>
      setCompleted(!next)
    );
  }

  function copyDriver() {
    if (!driver_info) return;
    navigator.clipboard.writeText(driver_info).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function applyStatusOverride(override: StatusOverride) {
    const prev = statusOverride;
    setStatusOverride(override);
    setShowStatusMenu(false);
    updateFlightStatus(id, override);
    fetch(`/api/flights/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status_override: override }),
    }).catch(() => {
      setStatusOverride(prev);
      updateFlightStatus(id, prev);
    });
  }

  function saveNotes(value?: string) {
    const toSave = (value !== undefined ? value : notes).trim() || null;
    updateFlightNotes(id, toSave);
    fetch(`/api/flights/${id}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: toSave }),
    }).catch(() => {
      // Revert store on failure
      updateFlightNotes(id, initialNotes);
    });
  }

  return (
    <div
      className={`glass-card p-4 rounded-xl mb-3 border border-card-border border-l-4 ${borderLeft} hover:bg-white/5 transition-colors
        ${isPast || completed ? "opacity-40" : ""}
        ${completed ? "grayscale" : ""}`}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
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
            {flight_number && !flight_number.toLowerCase().startsWith("please") ? flight_number : "—"} &middot; {agent}
          </span>
          {file_ref && (
            <span className="text-xs font-mono text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded">
              {file_ref}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Notified badge */}
          {notified && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#39FF14]/10 border border-[#39FF14]/20 text-xs font-medium text-[#39FF14]">
              <MessageCircle className="w-3 h-3" />
              <span className="hidden sm:inline">Notified</span>
            </div>
          )}

          {/* Mark as done button */}
          <button
            onClick={toggleComplete}
            title={completed ? "Mark as pending" : "Mark as done"}
            className={`p-1 rounded transition-colors ${
              completed
                ? "text-[#39FF14] hover:text-zinc-400"
                : "text-zinc-600 hover:text-[#39FF14]"
            }`}
          >
            {completed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
          </button>

          {/* Status badge — clickable to open override menu */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono tracking-wider uppercase border ${statusStyle} ${
                effectiveIsDelayed ? "animate-pulse" : ""
              }`}
            >
              <span className="text-[10px]">{statusDot}</span>
              <span className="hidden sm:inline">{effectiveStatus}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {showStatusMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 w-36 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl overflow-hidden">
                {statusOverride !== null && (
                  <button
                    onClick={() => applyStatusOverride(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3 text-zinc-500" /> Reset
                  </button>
                )}
                <button
                  onClick={() => applyStatusOverride("Delayed")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-amber-400 hover:bg-zinc-800 transition-colors"
                >
                  <AlertTriangle className="w-3 h-3" /> Delayed
                </button>
                <button
                  onClick={() => applyStatusOverride("Cancelled")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-rose-400 hover:bg-zinc-800 transition-colors"
                >
                  <XCircle className="w-3 h-3" /> Cancelled
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">{pax_name}</h2>
          <div className="flex items-center gap-4 mt-1 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {pax_count} Pax
            </span>
            <span className="flex items-center gap-1 text-[#39FF14]">
              <Car className="w-3.5 h-3.5" /> {driver_info}
              <button
                onClick={copyDriver}
                title="Copy driver info"
                className="ml-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-[#39FF14]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
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
            {effectiveIsDelayed && updated_time ? (
              <>
                <span className="text-xs text-zinc-500 line-through font-mono">
                  {scheduled_time}
                </span>
                <span className="text-xl font-bold font-mono text-amber-500">
                  {updated_time}
                </span>
              </>
            ) : effectiveIsCancelled ? (
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

      {/* ── Notes section ──────────────────────────────────────────────── */}
      <div className="mt-3 pt-3 border-t border-white/5">
        {showNotes ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={(e) => { if (!skipBlurRef.current) saveNotes(e.target.value); }}
              placeholder="Add dispatcher notes…"
              rows={2}
              className="w-full bg-zinc-900/60 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500 transition-colors"
            />
            <button
              onMouseDown={() => { skipBlurRef.current = true; }}
              onClick={() => { skipBlurRef.current = false; setShowNotes(false); setNotes(""); saveNotes(""); }}
              className="self-end text-[10px] text-zinc-700 hover:text-zinc-500 font-mono uppercase tracking-widest transition-colors"
            >
              Remove note
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowNotes(true); setTimeout(() => notesRef.current?.focus(), 50); }}
            className="flex items-center gap-1.5 text-[10px] text-zinc-700 hover:text-zinc-500 font-mono uppercase tracking-widest transition-colors"
          >
            <FileText className="w-3 h-3" />
            {notes ? notes : "Add note"}
          </button>
        )}
      </div>
    </div>
  );
}
