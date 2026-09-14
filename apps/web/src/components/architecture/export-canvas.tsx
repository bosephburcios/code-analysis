"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { ArchitectureCanvas } from "./architecture-canvas";
import type { ArchitectureNode, ArchitectureEdge } from "@/lib/architecture/types";

// Renders an off-screen, export-mode ArchitectureCanvas and rasterizes it to
// a PNG data URL via html-to-image — the standard xyflow-ecosystem pattern
// for exporting a React Flow canvas as an image. Mount this only while a
// capture is in progress; the caller controls unmounting once onCapture (or
// onError) fires.
export function ExportCanvas({
  nodes, edges, highlightedIds, onCapture, onError,
}: {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  highlightedIds?: Set<string> | null;
  onCapture: (dataUrl: string) => void;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const capturedRef = useRef(false);

  async function capture() {
    if (capturedRef.current) return;
    capturedRef.current = true;
    try {
      const container = containerRef.current;
      const canvasRoot = container?.firstElementChild as HTMLElement | null;
      const viewport = container?.querySelector<HTMLElement>(".react-flow__viewport");
      if (!canvasRoot || !viewport) throw new Error("Could not find the rendered diagram to capture.");
      // Resolve the real theme-aware background color from the live DOM
      // instead of guessing a literal hex value — this stays correct in
      // both light and dark mode with zero extra plumbing.
      const backgroundColor = getComputedStyle(canvasRoot).backgroundColor;
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(viewport, { pixelRatio: 3, backgroundColor, skipFonts: true });
      onCapture(dataUrl);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not export the diagram image.");
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={containerRef} style={{ position: "fixed", left: -99_999, top: 0, pointerEvents: "none" }} aria-hidden="true">
      <ArchitectureCanvas
        nodes={nodes}
        edges={edges}
        highlightedIds={highlightedIds}
        exportMode
        onExportReady={() => void capture()}
      />
    </div>,
    document.body,
  );
}
