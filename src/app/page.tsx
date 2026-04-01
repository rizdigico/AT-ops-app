"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { TopNav } from "@/components/TopNav";
import { StatsRow } from "@/components/StatsRow";
import { FlightCard } from "@/components/FlightCard";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { useAppStore, mapDbFlight, DbFlight } from "@/store/useAppStore";
import { createClient } from "@/utils/supabase/client";
import { Radio, Loader2, Trash2, ArrowLeft } from "lucide-react";

// Singleton browser client — safe at module level in a client component
const supabase = createClient();

export default function Home() {
  const [showUpload, setShowUpload] = useState(false);

  // Clear-button state
  const [clearStage, setClearStage] = useState<"idle" | "confirm" | "holding" | "clearing">("idle");
  const [holdProgress, setHoldProgress] = useState(0);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const flights = useAppStore((s) => s.flights);
  const isLoading = useAppStore((s) => s.isLoading);
  const setFlights = useAppStore((s) => s.setFlights);
  const setLoading = useAppStore((s) => s.setLoading);
  const applyRealtimeEvent = useAppStore((s) => s.applyRealtimeEvent);

  const fetchFlights = useCallback(async () => {
    setLoading(true);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

    const { data, error } = await supabase
      .from("flights")
      .select("*")
      .eq("date", today)
      .order("scheduled_time", { ascending: true });

    if (error) {
      console.error("[fetchFlights]", error.message);
    } else {
      setFlights((data as DbFlight[]).map(mapDbFlight));
    }
    setLoading(false);
  }, [setFlights, setLoading]);

  useEffect(() => {
    fetchFlights();

    const channel = supabase
      .channel("flights-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flights" },
        (payload) => {
          const event = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          const row = (payload.new ?? payload.old) as DbFlight;
          applyRealtimeEvent(event, row);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchFlights, applyRealtimeEvent]);

  // ── Clear logic ─────────────────────────────────────────────────────────────

  const startHold = useCallback(() => {
    if (clearStage !== "confirm") return;
    setClearStage("holding");
    setHoldProgress(0);
    let elapsed = 0;

    holdInterval.current = setInterval(() => {
      elapsed += 50;
      const pct = Math.min((elapsed / 5000) * 100, 100);
      setHoldProgress(pct);

      if (elapsed >= 5000) {
        clearInterval(holdInterval.current!);
        holdInterval.current = null;
        setClearStage("clearing");

        fetch("/api/flights/clear", { method: "DELETE" })
          .then(() => fetchFlights())
          .finally(() => {
            setClearStage("idle");
            setHoldProgress(0);
          });
      }
    }, 50);
  }, [clearStage, fetchFlights]);

  const cancelHold = useCallback(() => {
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
    if (clearStage === "holding") {
      setClearStage("confirm");
      setHoldProgress(0);
    }
  }, [clearStage]);

  const resetClear = useCallback(() => {
    if (holdInterval.current) clearInterval(holdInterval.current);
    setClearStage("idle");
    setHoldProgress(0);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (showUpload) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <TopNav onUploadClick={() => setShowUpload(true)} />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
          <button
            onClick={() => setShowUpload(false)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-mono uppercase tracking-widest mb-6 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Back to Operations
          </button>
          <ScheduleUploader
            onSuccess={() => {
              fetchFlights();
              setShowUpload(false);
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopNav onUploadClick={() => setShowUpload(true)} />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 flex flex-col">

        <StatsRow />

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-mono">Fetching live data…</span>
          </div>
        ) : flights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600 gap-3">
            <Radio className="w-8 h-8" />
            <p className="text-sm">No transfers scheduled for today.</p>
            <button
              onClick={() => setShowUpload(true)}
              className="text-xs text-[#00f3ff] hover:underline font-mono mt-1"
            >
              Upload a schedule →
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-4">
              Today&apos;s Transfers
            </h2>
            {flights.map((flight) => (
              <FlightCard key={flight.id} {...flight} />
            ))}
          </>
        )}

        {/* ── Clear All Data button ── */}
        {flights.length > 0 && (
          <div className="mt-10 mb-2 flex flex-col items-center gap-3">

            {clearStage === "idle" && (
              <button
                onClick={() => setClearStage("confirm")}
                className="flex items-center gap-2 text-xs text-zinc-600 hover:text-red-400 font-mono uppercase tracking-widest transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All Data
              </button>
            )}

            {(clearStage === "confirm" || clearStage === "holding") && (
              <div className="w-full max-w-xs flex flex-col items-center gap-3">
                <p className="text-xs text-zinc-400 font-mono text-center">
                  {clearStage === "confirm"
                    ? "This will delete all flight records. Hold the button for 5s to confirm."
                    : "Keep holding…"}
                </p>

                {/* Hold button with progress fill */}
                <div className="relative w-full h-10 rounded-lg overflow-hidden border border-red-900/60 cursor-pointer select-none"
                  onMouseDown={startHold}
                  onMouseUp={cancelHold}
                  onMouseLeave={cancelHold}
                  onTouchStart={startHold}
                  onTouchEnd={cancelHold}
                >
                  {/* Progress fill */}
                  <div
                    className="absolute inset-y-0 left-0 bg-red-900/60 transition-none"
                    style={{ width: `${holdProgress}%` }}
                  />
                  <div className="relative z-10 flex items-center justify-center h-full gap-2 text-xs font-mono uppercase tracking-widest text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                    {clearStage === "confirm" ? "Hold to Delete All" : `Deleting… ${Math.round(holdProgress)}%`}
                  </div>
                </div>

                <button
                  onClick={resetClear}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 font-mono uppercase tracking-widest transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {clearStage === "clearing" && (
              <div className="flex items-center gap-2 text-xs text-red-400 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Clearing database…
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
