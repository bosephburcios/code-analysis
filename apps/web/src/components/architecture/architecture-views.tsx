"use client";

import { architectureEvidence } from "@/lib/architecture/types";

import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reconcileSemanticRoles } from "@/lib/architecture/semantic-roles";
import { semanticToArchitectureGraph } from "@/lib/architecture/semantic-to-raw";
import { ArchitectureCanvas } from "./architecture-canvas";
import { DependenciesView } from "./dependencies-view";
import { SemanticInspector } from "./semantic-inspector";
import type {
  ArchitectureGraph,
  StoredArchitecture,
} from "@/lib/architecture/types";
import type { SemanticArchitecture } from "@/lib/architecture/semantic-schema";

export function ArchitectureViews({
  repositoryId,
  architecture,
  onGenerated,
  onRefresh,
  refreshing,
}: {
  repositoryId: string;
  architecture: StoredArchitecture;
  onRefresh: () => void;
  refreshing: boolean;
  onGenerated: (graph: SemanticArchitecture, generatedAt: string) => void;
}) {
  const [tab, setTab] = useState<"architecture" | "dependencies">(
    "architecture",
  );
  const semantic = useMemo(() => architecture.semanticGraph
    ? reconcileSemanticRoles(architecture.semanticGraph, architectureEvidence(architecture.rawGraph).nodes)
    : null, [architecture]);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{ id: string; graph: SemanticArchitecture } | null>(null);
  const selected = semantic && selection?.graph === semantic ? semantic.nodes.find(node => node.id === selection.id) ?? null : null;
  function selectComponent(id: string) { if (semantic) setSelection({ id, graph: semantic }); }
  const highlightedIds = useMemo(() => selected && semantic ? new Set([
    selected.id,
    ...semantic.edges.filter(edge => edge.source === selected.id || edge.target === selected.id).flatMap(edge => [edge.source, edge.target]),
  ]) : null, [selected, semantic]);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const graph = useMemo<ArchitectureGraph | null>(
    () => (semantic ? semanticToArchitectureGraph(semantic) : null),
    [semantic],
  );

  async function generate() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/repositories/${repositoryId}/architecture/semantic`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: Boolean(semantic) }), signal: AbortSignal.timeout(330_000) },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not generate architecture.");
      onGenerated(data.semanticGraph, data.generatedAt);
    } catch (error) {
      setError(
        error instanceof Error && error.name !== "TimeoutError"
          ? error.message
          : "Generation timed out. Dependencies remain available.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!architecture.rawGraph.responsibilities && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm">
          <p>This graph uses the older technology-only scan. Update source evidence to identify responsibilities.</p>
          <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? "Scanning source…" : "Update source evidence"}
          </Button>
        </div>
      )}
      {architecture.rawGraph.responsibilities && !architecture.rawGraph.responsibilities.coverage.complete && (
        <p role="status" className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          Partial source evidence: {architecture.rawGraph.responsibilities.coverage.scanned} of {architecture.rawGraph.responsibilities.coverage.total} eligible files scanned. {architecture.rawGraph.responsibilities.coverage.reason} Connections may be missing.
        </p>
      )}
      <div
        role="tablist"
        aria-label="Graph views"
        className="inline-flex gap-1 rounded-lg bg-muted p-1"
      >
        {(["architecture", "dependencies"] as const).map((value, index) => (
          <Button
            key={value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={`tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            variant={tab === value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
              setTab(next === 0 ? "architecture" : "dependencies");
              buttons.current[next]?.focus();
            }}
          >
            {value === "architecture" ? "Architecture" : "Dependencies"}
          </Button>
        ))}
      </div>
      {tab === "architecture" && semantic && (
        <p className="text-xs text-muted-foreground">
          {semantic.nodes.length} components · {semantic.edges.length}{" "}
          connections
        </p>
      )}
      <div
        id="panel-dependencies"
        role="tabpanel"
        aria-labelledby="tab-dependencies"
        hidden={tab !== "dependencies"}
      >
        {tab === "dependencies" && (
          <DependenciesView architecture={architecture.rawGraph} />
        )}
      </div>
      <div
        id="panel-architecture"
        role="tabpanel"
        aria-labelledby="tab-architecture"
        hidden={tab !== "architecture"}
        className="space-y-4"
      >
        {!semantic && (
          <div className="rounded-lg border bg-muted/10 px-6 py-10 text-center">
            <h3 className="font-semibold">A clearer system overview</h3>
            <p className="mx-auto mb-5 mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Group detected components into architectural concepts with a local
              model. Every concept retains its source evidence and a confidence
              score.
            </p>
            <Button
              disabled={busy || refreshing || !architecture.rawGraph.responsibilities || !architectureEvidence(architecture.rawGraph).nodes.length}
              onClick={() => void generate()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Generating architecture…" : "Generate architecture"}
            </Button>
            {busy && (
              <p role="status" className="mt-3 text-xs text-muted-foreground">
                Running a local AI model to group components and explain each
                one — this usually takes 30–90 seconds depending on repo
                size. You can still browse Dependencies while you wait.
              </p>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm"
          >
            {error}
          </p>
        )}
        {graph && tab === "architecture" && <ArchitectureCanvas {...graph} inspectable onNodeClick={selectComponent} selectedId={selected?.id} highlightedIds={highlightedIds}
          subtitle="Select a component to inspect · hover a connection to see its flow" />}
        {semantic && tab === "architecture" && <SemanticInspector repositoryId={repositoryId} node={selected} semantic={semantic} rawGraph={architecture.rawGraph}
          onSelect={selectComponent} onClose={() => setSelection(null)} />}
        {semantic && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <a href="#components" className="text-sm text-muted-foreground underline underline-offset-4">
                View descriptions, confidence, and evidence in the component index
              </a>
              <Button variant="outline" size="sm" disabled={busy || refreshing || !architecture.rawGraph.responsibilities} onClick={() => void generate()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "Regenerating…" : "Regenerate architecture"}
              </Button>
            </div>
            {busy && (
              <p role="status" className="text-xs text-muted-foreground">
                Running a local AI model to re-group components and explain
                each one — this usually takes 30–90 seconds depending on repo
                size. The current graph stays visible until it&apos;s done.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
