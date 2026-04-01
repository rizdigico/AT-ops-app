"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

export function KineticStats() {
  const stats = [
    {
      label: "Total Flights",
      value: "124",
      color: "text-[#00f3ff]",
      borderColor: "border-[#00f3ff]/30",
      Type: "fractal",
    },
    {
      label: "Pending",
      value: "42",
      color: "text-[#e2f1fa]",
      borderColor: "border-[#e2f1fa]/30",
      Type: "swarm",
    },
    {
      label: "Delayed",
      value: "14",
      color: "text-[#ffaa00]",
      borderColor: "border-[#ffaa00]/30",
      Type: "chaotic",
      alert: true,
    },
  ];

  const FractalPattern = () => (
    <motion.svg viewBox="0 0 100 100" className="w-16 h-16 opacity-40">
      <motion.circle cx="50" cy="50" r="40" stroke="#00f3ff" strokeWidth="1" fill="none"
        initial={{ rotate: 0 }}
        animate={{ rotate: 360, strokeDasharray: ["10 20", "5 40", "20 5"] }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />
      <motion.circle cx="50" cy="50" r="25" stroke="#00f3ff" strokeWidth="0.5" fill="none"
        initial={{ rotate: 360 }}
        animate={{ rotate: 0, strokeDasharray: ["5 10", "15 15"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      <motion.path d="M50 10 L60 40 L90 50 L60 60 L50 90 L40 60 L10 50 L40 40 Z" stroke="#00f3ff" strokeWidth="0.5" fill="transparent"
        animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
    </motion.svg>
  );

  const SwarmPattern = () => {
    // Math.random causing hydration issues in nextjs unless useMemo
    const particles = useMemo(() => Array.from({ length: 12 }), []);
    return (
      <div className="relative w-16 h-16">
        {particles.map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-[#e2f1fa] rounded-full top-1/2 left-1/2"
            animate={{
              x: [((i * 13) % 40) - 20, ((i * 7) % 40) - 20, 0],
              y: [((i * 11) % 40) - 20, ((i * 17) % 40) - 20, 0],
              opacity: [0.2, 0.8, 0.2]
            }}
            transition={{ duration: 2 + (i % 3), repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
    );
  };

  const ChaoticCloud = () => (
    <motion.svg viewBox="0 0 100 100" className="w-16 h-16 opacity-60">
      {[1, 2, 3].map((i) => (
        <motion.path
          key={i}
          d="M 20 50 Q 30 20, 50 30 T 80 50 T 50 70 T 20 50"
          stroke="#ffaa00"
          strokeWidth={1}
          fill="none"
          animate={{
            scale: [1, (i * 0.2) + 1.2, 1],
            rotate: [0, 180, 360],
            opacity: [0.3, 0.9, 0.3]
          }}
          transition={{ duration: 2 + i, repeat: Infinity, ease: "circIn" }}
          style={{ transformOrigin: "50% 50%" }}
        />
      ))}
      <motion.circle cx="50" cy="50" r="8" fill="#ffaa00" animate={{ scale: [1, 2, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }} />
    </motion.svg>
  );

  return (
    <div className="flex flex-wrap sm:flex-nowrap gap-6 p-4">
      {stats.map((stat, i) => (
        <motion.div 
          key={i}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.2 }}
          className={`relative p-5 glass-card rounded-xl border-t-2 ${stat.borderColor} min-w-[200px] flex gap-4 overflow-hidden`}
        >
          {stat.alert && (
            <motion.div className="absolute inset-0 bg-[#ffaa00]/5" animate={{ opacity: [0, 0.5, 0] }} transition={{ duration: 2, repeat: Infinity }} />
          )}
          <div className="z-10 bg-black/40 rounded p-2 flex items-center justify-center">
            {stat.Type === "fractal" && <FractalPattern />}
            {stat.Type === "swarm" && <SwarmPattern />}
            {stat.Type === "chaotic" && <ChaoticCloud />}
          </div>
          <div className="z-10 flex flex-col justify-center">
            <span className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-mono mb-1">{stat.label}</span>
            <span className={`text-4xl font-bold font-mono tracking-tighter ${stat.color} drop-shadow-[0_0_10px_currentColor]`}>
              {stat.value}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
