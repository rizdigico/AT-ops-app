"use client";

import { useEffect, useCallback } from "react";
import { TopNav } from "@/components/TopNav";
import { StatsRow } from "@/components/StatsRow";
import { FlightCard } from "@/components/FlightCard";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { useAppStore, mapDbFlight, DbFlight } from "@/store/useAppStore";
import { createClient } from "@/utils/supabase/client";
import { Upload, Radio, Loader2 } from "lucide-react";
import { useState } from "react";

type Tab = "ops" | "upload";

// Singleton browser client — safe at module level in a client component
const supabase = createClient();

export default function Home() {
  const [tab, setTab] = useState<Tab>("ops");
  const flights = useAppStore((s) => s.flights);
  const isLoading = useAppStore((s) => s.isLoading);
  const setFlights = useAppStore((s) => s.setFlights);
  const setLoading = useAppStore((s) => s.setLoading);
  const applyRealtimeEvent = useAppStore((s) => s.applyRealtimeEvent);

  // Fetch today's flights from Supabase, ordered by scheduled_time SGT
  const fetchFlights = useCallback(async () => {
    setLoading(true);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }); // YYYY-MM-DD

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

  // Mount: initial fetch + Realtime subscription
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFlights, applyRealtimeEvent]);

  const tabs = [
    { id: "ops" as Tab, label: "Live Operations", icon: Radio },
    { id: "upload" as Tab, label: "Upload", icon: Upload },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopNav />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 bg-card/60 p-1 rounded-lg border border-card-border w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.id === "ops" && flights.length > 0 && (
                <span className="ml-1 text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono">
                  {flights.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "ops" && (
          <>
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
                  onClick={() => setTab("upload")}
                  className="text-xs text-[#00f3ff] hover:underline font-mono mt-1"
                >
                  Upload a schedule →
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-4">
                  Today&apos;s Transfers
                </h2>
                {flights.map((flight) => (
                  <FlightCard key={flight.id} {...flight} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "upload" && (
          <ScheduleUploader
            onSuccess={() => {
              fetchFlights();
              setTab("ops");
            }}
          />
        )}
      </main>
    </div>
  );
}
