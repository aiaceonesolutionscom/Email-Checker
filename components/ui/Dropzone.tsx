"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "./Button";

export function Dropzone({
  onFile,
  accept = ".csv,.xlsx,.xls,.txt",
  hint = ".CSV, .XLSX, .XLS, .TXT",
}: {
  onFile: (file: File) => void;
  accept?: string;
  hint?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-colors " +
        (dragOver
          ? "border-brand-400 bg-brand-500/5"
          : "border-slate-300 bg-slate-50 hover:border-slate-400")
      }
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <UploadCloud className="mb-4 h-12 w-12 text-slate-400" strokeWidth={1.5} />
      <p className="text-lg font-semibold text-slate-900">Drag &amp; drop your file here</p>
      <p className="mt-1 text-sm text-slate-500">or click to browse — {hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <Button className="mt-6" onClick={() => inputRef.current?.click()}>
        Choose File
      </Button>
    </div>
  );
}

export function DragOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-brand-400 bg-white px-12 py-14 text-center shadow-card">
        <p className="text-2xl font-bold text-brand-600">Drop your file here</p>
        <p className="mt-2 text-sm text-slate-500">Verification will start automatically</p>
      </div>
    </div>
  );
}
