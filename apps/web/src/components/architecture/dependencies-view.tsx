"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArchitectureCanvas } from "./architecture-canvas";
import { NodeInspector } from "./node-inspector";
import { PackageList } from "./package-list";
import { architectureEvidence, sourceNodeId } from "@/lib/architecture/types";
import { invertEdges, transitiveImpact } from "@/lib/architecture/graph-index";
import { layoutModules } from "@/lib/architecture/layout-modules";
import { layoutArchitecture } from "@/lib/architecture/layout-graph";
import type { ArchitectureGraph, ArchitectureNode } from "@/lib/architecture/types";

type Subtab = "modules" | "packages" | "data" | "external";

const SUBTABS: { id: Subtab; label: string }[] = [
  { id: "modules", label: "Modules" },
  { id: "packages", label: "Packages" },
  { id: "data", label: "Data" },
  { id: "external", label: "External" },
];

export function DependenciesView({
  architecture,
}: {
  architecture: ArchitectureGraph;
}) {
  const [subtab, setSubtab] = useState<Subtab>("modules");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [impactMode, setImpactMode] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const evidence = useMemo(() => architectureEvidence(architecture), [architecture]);
  const packages = architecture.responsibilities?.packages ?? [];
  const reverse = useMemo(() => invertEdges(evidence.edges), [evidence.edges]);
  const nodeById = useMemo(
    () => new Map(evidence.nodes.map((node) => [node.id, node])),
    [evidence.nodes],
  );

  function selectNode(id: string) {
    setSelectedId(id);
    setImpactMode(false);
  }
  function selectFile(path: string) {
    setSubtab("modules");
    selectNode(sourceNodeId(path));
  }
  function handleQueryChange(value: string) {
    setQuery(value);
    if (value) setImpactMode(false);
  }

  const matchedIds = useMemo(() => {
    if (!query) return null;
    const q = query.toLowerCase();
    return new Set(
      evidence.nodes
        .filter(
          (node) =>
            node.label.toLowerCase().includes(q) ||
            (node.path ?? "").toLowerCase().includes(q),
        )
        .map((node) => node.id),
    );
  }, [query, evidence.nodes]);

  const impactIds = useMemo(() => {
    if (!impactMode || !selectedId) return null;
    return new Set([selectedId, ...transitiveImpact(selectedId, reverse)]);
  }, [impactMode, selectedId, reverse]);

  const highlightedIds = matchedIds ?? impactIds;

  const modulesGraph = useMemo(() => {
    const nodes = evidence.nodes.filter(
      (node) => node.type !== "database" && node.type !== "external",
    );
    const ids = new Set(nodes.map((node) => node.id));
    const edges = evidence.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    );
    return { nodes, edges };
  }, [evidence]);

  const dataGraph = useMemo(() => {
    const dataIds = new Set(
      evidence.edges
        .filter((edge) => edge.kind === "data")
        .flatMap((edge) => [edge.source, edge.target]),
    );
    const nodes = evidence.nodes.filter(
      (node) => node.type === "database" || dataIds.has(node.id),
    );
    const ids = new Set(nodes.map((node) => node.id));
    const edges = evidence.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    );
    return { nodes, edges };
  }, [evidence]);

  const externalGraph = useMemo(() => {
    const externalIds = new Set(
      evidence.nodes.filter((node) => node.type === "external").map((node) => node.id),
    );
    const neighborIds = new Set<string>();
    for (const edge of evidence.edges) {
      if (externalIds.has(edge.source)) neighborIds.add(edge.target);
      if (externalIds.has(edge.target)) neighborIds.add(edge.source);
    }
    const nodes = evidence.nodes.filter(
      (node) => externalIds.has(node.id) || neighborIds.has(node.id),
    );
    const ids = new Set(nodes.map((node) => node.id));
    const edges = evidence.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    );
    return { nodes, edges };
  }, [evidence]);

  const selectedNode = selectedId ? (nodeById.get(selectedId) ?? null) : null;

  const dependsOn = useMemo(() => {
    if (!selectedId) return [];
    return evidence.edges
      .filter((edge) => edge.source === selectedId && edge.kind !== "data")
      .map((edge) => ({ node: nodeById.get(edge.target), names: edge.names ?? [] }))
      .filter(
        (entry): entry is { node: ArchitectureNode; names: string[] } =>
          Boolean(entry.node),
      );
  }, [selectedId, evidence.edges, nodeById]);

  const dependents = useMemo(() => {
    if (!selectedId) return [];
    return (reverse.get(selectedId) ?? [])
      .map((id) => nodeById.get(id))
      .filter((node): node is ArchitectureNode => Boolean(node));
  }, [selectedId, reverse, nodeById]);

  const operations = Array.isArray(selectedNode?.metadata?.operations)
    ? (selectedNode.metadata.operations as string[])
    : [];
  const externalPackages = selectedNode?.path
    ? packages.filter((pkg) => pkg.importedBy.includes(selectedNode.path!))
    : [];

  const activeGraph =
    subtab === "modules"
      ? modulesGraph
      : subtab === "data"
        ? dataGraph
        : subtab === "external"
          ? externalGraph
          : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Dependency views"
          className="inline-flex gap-1 rounded-lg bg-muted p-1"
        >
          {SUBTABS.map(({ id, label }, index) => (
            <Button
              key={id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              role="tab"
              aria-selected={subtab === id}
              tabIndex={subtab === id ? 0 : -1}
              variant={subtab === id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSubtab(id)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? SUBTABS.length - 1
                      : index + (event.key === "ArrowRight" ? 1 : -1);
                const clamped = Math.max(0, Math.min(SUBTABS.length - 1, next));
                setSubtab(SUBTABS[clamped].id);
                buttons.current[clamped]?.focus();
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <Input
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Search dependencies…"
          className="h-8 max-w-xs"
        />
      </div>

      {subtab === "packages" ? (
        <PackageList packages={packages} query={query} onSelectFile={selectFile} />
      ) : (
        <div className="relative">
          <ArchitectureCanvas
            nodes={activeGraph!.nodes}
            edges={activeGraph!.edges}
            layout={subtab === "modules" ? layoutModules : layoutArchitecture}
            onNodeClick={selectNode}
            selectedId={selectedId}
            highlightedIds={highlightedIds}
            title={
              subtab === "modules"
                ? "Modules"
                : subtab === "data"
                  ? "Data dependencies"
                  : "External dependencies"
            }
            subtitle={
              subtab === "modules"
                ? "File-to-file imports, grouped by directory"
                : subtab === "data"
                  ? "Files that read or write your data models"
                  : "External APIs and services this code calls"
            }
          />
          {selectedNode && (
            <NodeInspector
              node={selectedNode}
              dependsOn={dependsOn}
              dependents={dependents}
              operations={operations}
              externalPackages={externalPackages}
              impactActive={impactMode}
              onShowImpact={() => setImpactMode((value) => !value)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
