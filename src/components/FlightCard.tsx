"use client";

import { useState, useEffect } from "react";
import {
  PlaneLanding, PlaneTakeoff, Map,
  CheckCircle2, AlertTriangle, XCircle, RotateCcw,
  ChevronDown, ChevronUp, Copy, Check, MessageCircle,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Flight } from "@/store/useAppStore";

type StatusOverride = "Delayed" | "Cancelled" | null;

const TYPE_CONFIG = {
  Arrival:   { Icon: PlaneLanding,  accent: "#22c55e", dim: "#14532d", label: "Arrival",   symbol: "↙" },
  Departure: { Icon: PlaneTakeoff, accent: "#3b82f6", dim: "#1e3a8a", label: "Departure", symbol: "↗" },
  Tour:      { Icon: Map,          accent: "#f59e0b", dim: "#78350f", label: "Tour",      symbol: "◉" },
} as const;

const STATUS_CONFIG = {
  Completed: { bg: "#052e16", text: "#4ade80", dot: "#22c55e" },
  Cancelled: { bg: "#3b0000", text: "#f87171", dot: "#ef4444" },
  Delayed:   { bg: "#1c1200", text: "#f59e0b", dot: "#fbbf24" },
  Pending:   { bg: "#1c1200", text: "#fbbf24", dot: "#f59e0b" },
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+08:00");
  return d.toLocaleDateString("en-SG", {
    weekday: "short", day: "numeric", month: "short",
    timeZone: "Asia/Singapore",
  });
}

type DetailRow = [string, string | null | undefined];

export function FlightCard({
  id,
  file_ref,
  date,
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
  supplier,
  from_location,
  to_location,
  services,
}: Flight & { isPast?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [completed, setCompleted] = useState(initialCompleted);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [noteInput, setNoteInput] = useState(initialNotes ?? "");
  const [statusOverride, setStatusOverride] = useState<StatusOverride>(initialStatusOverride);
  const [copied, setCopied] = useState(false);

  const updateFlightStatus = useAppStore((s) => s.updateFlightStatus);
  const updateFlightNotes  = useAppStore((s) => s.updateFlightNotes);

  useEffect(() => { setStatusOverride(initialStatusOverride); }, [initialStatusOverride]);
  useEffect(() => {
    setNotes(initialNotes ?? "");
    setNoteInput(initialNotes ?? "");
  }, [initialNotes]);

  const effectiveStatus = statusOverride ?? status;
  const tc = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.Arrival;

  const opStatus: "Completed" | "Cancelled" | "Delayed" | "Pending" = completed
    ? "Completed"
    : effectiveStatus === "Cancelled"
      ? "Cancelled"
      : effectiveStatus === "Delayed"
        ? "Delayed"
        : "Pending";

  const sc = STATUS_CONFIG[opStatus];

  function toggleComplete() {
    const next = !completed;
    setCompleted(next);
    fetch(`/api/flights/${id}/complete`, { method: "PATCH" }).catch(() => setCompleted(!next));
  }

  function applyStatusOverride(override: StatusOverride) {
    const prev = statusOverride;
    setStatusOverride(override);
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

  function saveNotes() {
    const toSave = noteInput.trim() || null;
    updateFlightNotes(id, toSave);
    setNotes(toSave ?? "");
    fetch(`/api/flights/${id}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: toSave }),
    }).catch(() => updateFlightNotes(id, initialNotes));
  }

  function copyDriver() {
    if (!driver_info) return;
    navigator.clipboard.writeText(driver_info).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const showFlight = flight_number && !flight_number.toLowerCase().startsWith("please");
  const routeSummary = from_location && to_location && from_location !== to_location
    ? `${from_location} → ${to_location}`
    : from_location || to_location || "";

  const timeDisplay = effectiveStatus === "Delayed" && updated_time
    ? `${scheduled_time} → ${updated_time}`
    : scheduled_time;

  const details: DetailRow[] = [
    ["File Ref", file_ref],
    ["Agent", agent],
    ["Supplier", supplier],
    ["Service", services],
    ["Flight", showFlight ? flight_number : undefined],
    ["Terminal", terminal !== "TBC" ? terminal : undefined],
    ["Pickup Time", scheduled_time],
    ["Updated Time", updated_time],
    ["Driver / Contact", driver_info],
    ["From", from_location],
    ["To", to_location],
    ["Notified", notified ? "Yes ✓" : "No"],
  ];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "#111827",
        border: `1px solid ${isOpen ? tc.accent + "44" : "#1f2937"}`,
        borderLeft: `3px solid ${tc.accent}`,
      }}
    >
      {/* ── Compact row ── */}
      <div
        onClick={() => setIsOpen((v) => !v)}
        className="px-4 py-3 cursor-pointer select-none"
        style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "12px", alignItems: "start" }}
      >
        {/* Type icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 mt-0.5 font-bold"
          style={{ background: tc.dim, border: `1px solid ${tc.accent}33`, color: tc.accent }}
        >
          {tc.symbol}
        </div>

        {/* Info */}
        <div className="min-w-0">
          {/* Top: name + badges */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-sm font-semibold text-white leading-snug">{pax_name}</span>

            {showFlight && (
              <span className="font-mono text-[11px] bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-blue-300 whitespace-nowrap">
                {flight_number}
              </span>
            )}
            {terminal && terminal !== "TBC" && (
              <span className="text-[11px] text-zinc-500 whitespace-nowrap">{terminal}</span>
            )}
            {notified && (
              <span className="flex items-center gap-1 text-[11px] text-[#39FF14] whitespace-nowrap">
                <MessageCircle className="w-3 h-3" /> Notified
              </span>
            )}

            {/* opStatus badge */}
            <span
              className="text-[11px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: sc.bg, color: sc.text }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc.dot }} />
              {opStatus}
            </span>

            {opStatus === "Pending" && (
              <span className="text-[10px] bg-amber-950 text-amber-400 border border-amber-900 rounded px-1.5 py-0.5 font-bold whitespace-nowrap">
                ACTION NEEDED
              </span>
            )}
          </div>

          {/* Bottom: meta row */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
            <span>{formatDateLabel(date)}</span>
            {timeDisplay && <span>⏰ {timeDisplay}</span>}
            <span>🚐 {driver_info || "—"}</span>
            <span>👥 {pax_count} pax</span>
            {supplier && <span className="text-violet-400">{supplier}</span>}
            <span style={{ color: tc.accent, fontWeight: 600 }}>{type}</span>
          </div>

          {/* Route summary */}
          {routeSummary && (
            <div className="mt-0.5 text-[11px] text-zinc-700 truncate">{routeSummary}</div>
          )}
        </div>

        {/* Chevron */}
        <div className="text-zinc-500 shrink-0 pt-1">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {isOpen && (
        <div
          className="border-t border-zinc-800 px-4 pb-4 pt-3"
          style={{ background: "#0d1320", paddingLeft: "58px" }}
        >
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
            {details.map(([label, val]) => (
              val ? (
                <div key={label}>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">{label}</div>
                  <div className="text-xs text-zinc-200 break-words">{val}</div>
                </div>
              ) : null
            ))}
          </div>

          {/* Notes */}
          <div className="mb-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Internal Notes</div>
            {notes && (
              <div className="text-xs text-amber-400 bg-amber-950 border border-amber-900 rounded-lg px-3 py-2 mb-2 leading-relaxed">
                {notes}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveNotes(); }}
                placeholder="Add or update note…"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <button
                onClick={saveNotes}
                className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {opStatus !== "Cancelled" && (
              <button
                onClick={toggleComplete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors"
                style={{
                  borderColor: opStatus === "Completed" ? "#374151" : "#166534",
                  background: opStatus === "Completed" ? "#111827" : "#052e16",
                  color: opStatus === "Completed" ? "#9ca3af" : "#4ade80",
                }}
              >
                {opStatus === "Completed"
                  ? <><RotateCcw className="w-3.5 h-3.5" /> Mark Pending</>
                  : <><CheckCircle2 className="w-3.5 h-3.5" /> Mark Completed</>
                }
              </button>
            )}

            {statusOverride !== "Delayed" && opStatus !== "Completed" && opStatus !== "Cancelled" && (
              <button
                onClick={() => applyStatusOverride("Delayed")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-900 bg-amber-950 text-amber-400 text-xs font-semibold hover:bg-amber-900 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Flag Delayed
              </button>
            )}

            {statusOverride !== "Cancelled" && opStatus !== "Completed" && (
              <button
                onClick={() => applyStatusOverride("Cancelled")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-900 bg-red-950 text-red-400 text-xs font-semibold hover:bg-red-900 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </button>
            )}

            {statusOverride !== null && (
              <button
                onClick={() => applyStatusOverride(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 text-xs font-semibold hover:bg-zinc-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset Status
              </button>
            )}

            {driver_info && (
              <button
                onClick={copyDriver}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 text-xs font-semibold hover:bg-zinc-800 transition-colors"
              >
                {copied
                  ? <><Check className="w-3.5 h-3.5 text-[#39FF14]" /> Copied</>
                  : <><Copy className="w-3.5 h-3.5" /> Copy Driver</>
                }
              </button>
            )}

            <span className="ml-auto text-[10px] text-zinc-700 font-mono">
              {file_ref} · {type}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
