"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArchitectureCanvas } from "./architecture-canvas";
import type {
  ArchitectureGraph,
  ArchitectureNode,
  StoredArchitecture,
} from "@/lib/architecture/types";
import type { SemanticArchitecture } from "@/lib/architecture/semantic-schema";

const types: Record<
  SemanticArchitecture["nodes"][number]["type"],
  ArchitectureNode["type"]
> = {
  feature: "service",
  frontend: "frontend",
  backend: "api",
  database: "database",
  external: "external",
  infrastructure: "infra",
  pipeline: "service",
};
export function ArchitectureViews({
  repositoryId,
  architecture,
}: {
  repositoryId: string;
  architecture: StoredArchitecture;
}) {
  const [tab, setTab] = useState<"architecture" | "dependencies">(
    "architecture",
  );
  const [semantic, setSemantic] = useState(architecture.semanticGraph);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const graph = useMemo<ArchitectureGraph | null>(
    () =>
      semantic
        ? {
            nodes: semantic.nodes.map((node) => ({
              id: node.id,
              label: node.label,
              type: types[node.type],
              metadata: {
                confidence: node.confidence,
                description: node.description,
                evidence: node.files,
                semanticType: node.type,
              },
            })),
            edges: semantic.edges.map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              label: edge.label,
              kind:
                edge.type === "data"
                  ? "data"
                  : edge.type === "async"
                    ? "async"
                    : "sync",
            })),
          }
        : null,
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
        { method: "POST", signal: AbortSignal.timeout(330_000) },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not generate architecture.");
      setSemantic(data.semanticGraph);
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
      {(tab === "dependencies" || semantic) && (
        <p className="text-xs text-muted-foreground">
          {tab === "dependencies"
            ? architecture.rawGraph.nodes.length
            : semantic!.nodes.length}{" "}
          components ·{" "}
          {tab === "dependencies"
            ? architecture.rawGraph.edges.length
            : semantic!.edges.length}{" "}
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
          <ArchitectureCanvas {...architecture.rawGraph} />
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
              disabled={busy || !architecture.rawGraph.nodes.length}
              onClick={() => void generate()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Generating architecture…" : "Generate architecture"}
            </Button>
            {busy && (
              <p role="status" className="mt-3 text-xs text-muted-foreground">
                Grouping evidence and validating references. You can still
                browse Dependencies.
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
        {graph && tab === "architecture" && <ArchitectureCanvas {...graph} />}
        {semantic && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Confidence is the model’s assessment of its grouping and label,
              not proof of runtime behavior. Relationships inherit the raw
              graph’s uncertainty.
            </p>
            {semantic.nodes.map((node) => (
              <details key={node.id} className="rounded-lg border px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2">
                  <span className="mr-3">{node.label}</span>
                  <Badge variant="outline">
                    {node.confidence >= 0.8
                      ? "High"
                      : node.confidence >= 0.5
                        ? "Moderate"
                        : "Low"}{" "}
                    confidence · {Math.round(node.confidence * 100)}%
                  </Badge>
                </summary>
                <div className="typeset typeset-docs mt-3 text-muted-foreground">
                  <p>{node.description}</p>
                </div>
                <h4 className="mb-2 mt-4 text-xs font-semibold">Based on</h4>
                <ul className="space-y-1 break-all font-mono text-xs text-muted-foreground">
                  {node.files.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Source components:{" "}
                  {node.sourceNodeIds
                    .map(
                      (id) =>
                        architecture.rawGraph.nodes.find(
                          (source) => source.id === id,
                        )?.label ?? id,
                    )
                    .join(", ")}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {node.technologies.map((technology) => (
                    <Badge key={technology} variant="secondary">
                      {technology}
                    </Badge>
                  ))}
                </div>
                {semantic.edges
                  .filter(
                    (edge) =>
                      edge.source === node.id || edge.target === node.id,
                  )
                  .map((edge) => (
                    <p
                      key={edge.id}
                      className="mt-2 text-xs text-muted-foreground"
                    >
                      {edge.label}:{" "}
                      {edge.sourceEdgeIds
                        .map((id) => {
                          const source = architecture.rawGraph.edges.find(
                            (item) => item.id === id,
                          );
                          return source
                            ? `${source.label ?? source.kind} (${source.source} → ${source.target})`
                            : id;
                        })
                        .join("; ")}
                    </p>
                  ))}
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
