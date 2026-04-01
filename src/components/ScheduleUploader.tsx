"use client";

import { useState, useRef, useCallback } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";

interface Props {
  onSuccess?: (count: number) => void;
}

export function ScheduleUploader({ onSuccess }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("Invalid file format");
  const [processedCount, setProcessedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "csv") {
      setErrorMsg("Please upload a .xlsx or .csv file");
      setStatus("error");
      return;
    }

    setFile(f);
    setStatus("processing");

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setErrorMsg(json.error ?? "Upload failed. Check server logs.");
        setStatus("error");
        return;
      }

      setProcessedCount(json.processedCount);
      setStatus("done");
      onSuccess?.(json.processedCount);
    } catch {
      setErrorMsg("Network error. Is the dev server running?");
      setStatus("error");
    }
  }, [onSuccess]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    setFile(null);
    setStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-mono mb-4">
        Weekly Schedule Upload
      </h2>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => status === "idle" && fileInputRef.current?.click()}
        className={`glass-card rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[280px] ${
          isDragging
            ? "border-[#00f3ff] bg-[#00f3ff]/5 scale-[1.01]"
            : status === "error"
            ? "border-[#ff003c]/50"
            : "hover:bg-white/5"
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".xlsx,.csv"
          onChange={handleChange}
        />

        {status === "idle" && (
          <>
            <UploadCloud className="w-12 h-12 text-zinc-500 mb-4" />
            <p className="text-sm text-zinc-300 font-medium">
              Drag & drop your Excel schedule here
            </p>
            <p className="text-xs text-zinc-500 mt-1">Accepts .xlsx or .csv files</p>
          </>
        )}

        {status === "processing" && (
          <>
            <FileSpreadsheet className="w-12 h-12 text-[#00f3ff] mb-4 animate-pulse" />
            <p className="text-sm text-zinc-300 font-medium">Uploading {file?.name}…</p>
            <div className="w-48 h-1 bg-zinc-800 rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-[#00f3ff] rounded-full animate-pulse" style={{ width: "100%" }} />
            </div>
          </>
        )}

        {status === "done" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-[#39FF14] mb-4" />
            <p className="text-sm text-white font-medium">
              {processedCount} records deployed
            </p>
            <p className="text-xs text-zinc-500 mt-1">{file?.name}</p>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="mt-4 text-xs text-zinc-400 hover:text-white font-mono uppercase tracking-wider transition-colors"
            >
              Upload Another
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="w-12 h-12 text-[#ff003c] mb-4" />
            <p className="text-sm text-[#ff003c] font-medium">{errorMsg}</p>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="mt-4 text-xs text-zinc-400 hover:text-white font-mono uppercase tracking-wider transition-colors"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
