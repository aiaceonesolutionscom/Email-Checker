"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Window-wide drag & drop overlay plumbing, extracted verbatim from the
 * original single-page implementation (same event names, same overlay
 * semantics) so existing Playwright coverage of the drag/drop bug fix
 * keeps working against the same rendered class shapes.
 */
export function useDragAndDrop(onFileDrop: (file: File) => void, isActive: boolean) {
  const [globalDrag, setGlobalDrag] = useState(false);

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const onFileDropRef = useRef(onFileDrop);
  onFileDropRef.current = onFileDrop;

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (isActiveRef.current) setGlobalDrag(true);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (
        !e.relatedTarget ||
        e.relatedTarget === document.documentElement ||
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth - 1 ||
        e.clientY >= window.innerHeight - 1
      ) {
        setGlobalDrag(false);
      }
    };
    const onDragEnd = () => setGlobalDrag(false);
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setGlobalDrag(false);
      if (isActiveRef.current) {
        const file = e.dataTransfer?.files?.[0];
        if (file) onFileDropRef.current(file);
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return { globalDrag, setGlobalDrag };
}
