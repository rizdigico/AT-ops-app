"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, Hexagon } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export function IrisUploader() {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [complete, setComplete] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const setIsDeployed = useAppStore(state => state.setIsDeployed);

  // Trigger drop
  const handleDrop = (e?: React.DragEvent) => {
    if (e) e.preventDefault();
    setIsOpen(true);
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setComplete(true);
    }, 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleDrop();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOpen(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsOpen(false);
  };

  const PolygonShutter = () => (
    <motion.svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none opacity-40 text-[#00f3ff]">
      <motion.polygon 
        points="50,10 90,30 90,70 50,90 10,70 10,30" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1"
        animate={{ rotate: isOpen ? 180 : 0, scale: isOpen ? 1.5 : 1, opacity: isOpen ? 0.8 : 0.3 }}
        transition={{ type: "spring", stiffness: 50, damping: 20 }}
        style={{ transformOrigin: "50% 50%" }}
      />
      <motion.circle 
        cx="50" cy="50" r="30" 
        fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="5,5"
        animate={{ rotate: -360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "50% 50%" }}
      />
    </motion.svg>
  );

  return (
    <div className="relative glass-card border border-card-border p-6 rounded-xl overflow-hidden min-h-[300px] flex items-center justify-center">
      <AnimatePresence mode="wait">
        {!complete ? (
          <motion.div
            key="shutter"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-full absolute inset-0 flex flex-col items-center justify-center z-10 cursor-pointer"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".csv, .xlsx" 
              onChange={handleFileChange}
            />
            <PolygonShutter />
            
            <motion.div
              animate={{ scale: isOpen ? 1.2 : 1, filter: isOpen ? "brightness(1.5)" : "brightness(1)" }}
              className="z-20 flex flex-col items-center gap-4 text-[#00f3ff]"
            >
              <div className="relative">
                <Hexagon className="w-16 h-16 opacity-50 absolute inset-0 animate-pulse" />
                <UploadCloud className="w-8 h-8 m-4 z-10 relative drop-shadow-[0_0_10px_#00f3ff]" />
              </div>
              <p className="font-mono text-sm tracking-widest uppercase shadow-black drop-shadow-md">
                {isProcessing ? "Ingesting Matrix..." : "Awaiting Deployment"}
              </p>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="data"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full h-full flex flex-col z-20"
          >
            <div className="flex items-center gap-3 border-b border-[#00f3ff]/20 pb-4 mb-4">
              <FileSpreadsheet className="w-6 h-6 text-[#00f3ff]" />
              <span className="font-mono text-lg text-white tracking-widest uppercase">Data_Node_Accepted</span>
              <span className="ml-auto text-xs bg-[#00f3ff]/20 text-[#00f3ff] px-2 py-1 rounded">V_1.0.4</span>
            </div>
            
            {/* Holographic Table Projection */}
            <div className="flex-1 overflow-x-auto perspective-1000">
              <motion.div 
                animate={{ rotateX: [20, 0], y: [20, 0] }}
                transition={{ type: "spring" }}
                className="grid gap-2 transform-style-3d"
              >
                <div className="grid grid-cols-4 font-mono text-xs uppercase text-zinc-500 border-b border-card-border pb-2">
                  <span>ID_Hash</span>
                  <span>Payload</span>
                  <span>Vector</span>
                  <span className="text-right">TDelta</span>
                </div>
                {[1, 2, 3].map((_, i) => (
                  <div key={i} className="grid grid-cols-4 font-mono text-xs text-[#e2f1fa] py-1 border-b border-white/5 hover:bg-white/5 cursor-crosshair">
                    <span className="text-zinc-500">0x{(i * 918273645).toString(16).slice(0, 6).toUpperCase()}</span>
                    <span>FLT_SYNC</span>
                    <span className="text-[#00f3ff]">T{(i % 4) + 1}_DOCK</span>
                    <span className="text-right text-[#ffaa00]">+{i * 5 + 2}min</span>
                  </div>
                ))}
              </motion.div>
            </div>

            <div className="mt-4 flex gap-4 justify-end border-t border-card-border pt-4">
              <button 
                onClick={(e) => { e.stopPropagation(); setComplete(false); }} 
                className="text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-widest transition-colors"
              >
                Abort
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsDeployed(true); }}
                className="bg-[#00f3ff] text-black font-bold font-mono text-xs uppercase px-4 py-2 rounded shadow-[0_0_15px_rgba(0,243,255,0.4)] hover:bg-white transition-all"
              >
                Execute Commit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
