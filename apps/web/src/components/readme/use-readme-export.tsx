"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ExportCanvas } from "@/components/architecture/export-canvas";
import { semanticToArchitectureGraph } from "@/lib/architecture/semantic-to-raw";
import { buildExportPackageEntries } from "@/lib/readme/build-export-package";
import type { SemanticArchitecture } from "@/lib/architecture/semantic-schema";

type CaptureTarget = { nodes: ReturnType<typeof semanticToArchitectureGraph>["nodes"]; edges: ReturnType<typeof semanticToArchitectureGraph>["edges"]; highlightedIds: Set<string> | null };

export function useReadmeExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(null);
  const resolverRef = useRef<{ resolve: (dataUrl: string) => void; reject: (message: string) => void } | null>(null);
  const pending = useRef(false);

  const captureOnce = useCallback((nodes: CaptureTarget["nodes"], edges: CaptureTarget["edges"], highlightedIds: Set<string> | null) => {
    return new Promise<string>((resolve, reject) => {
      resolverRef.current = { resolve, reject: message => reject(new Error(message)) };
      setCaptureTarget({ nodes, edges, highlightedIds });
    });
  }, []);

  const exportPortal: ReactNode = captureTarget && (
    <ExportCanvas
      nodes={captureTarget.nodes}
      edges={captureTarget.edges}
      highlightedIds={captureTarget.highlightedIds}
      onCapture={dataUrl => { resolverRef.current?.resolve(dataUrl); resolverRef.current = null; setCaptureTarget(null); }}
      onError={message => { resolverRef.current?.reject(message); resolverRef.current = null; setCaptureTarget(null); }}
    />
  );

  const exportPackage = useCallback(async (fileNameBase: string, markdown: string, semantic: SemanticArchitecture) => {
    if (pending.current) return;
    pending.current = true;
    setExporting(true);
    setError(null);
    try {
      const graph = semanticToArchitectureGraph(semantic);

      setProgress("Capturing architecture diagram…");
      const architectureDataUrl = await captureOnce(graph.nodes, graph.edges, null);
      const architecture = await (await fetch(architectureDataUrl)).blob();

      setProgress("Building package…");
      const entries = buildExportPackageEntries(markdown, { architecture });
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const entry of entries) zip.file(entry.path, entry.data);
      const blob = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileNameBase}-readme.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export the README package.");
    } finally {
      pending.current = false;
      setExporting(false);
      setProgress(null);
    }
  }, [captureOnce]);

  return { exporting, progress, error, exportPortal, exportPackage };
}
