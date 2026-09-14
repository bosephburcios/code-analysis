"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { architectureEvidence } from "@/lib/architecture/types";
import { Badge } from "@/components/ui/badge";
import { reconcileSemanticRoles, roleLabel } from "@/lib/architecture/semantic-roles";
import type { ArchitectureGraph, StoredArchitecture } from "@/lib/architecture/types";
import type { SemanticArchitecture, SemanticNode } from "@/lib/architecture/semantic-schema";
import type { ComponentEvidence } from "@/lib/architecture/evidence-types";
import { EvidenceLoader, EvidencePanel } from "./evidence-panel";

function ComponentRow({ node, repositoryId, semantic, rawGraph }: {
  node: SemanticNode; repositoryId: string; semantic: SemanticArchitecture; rawGraph: ArchitectureGraph;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [evidence, setEvidence] = useState<ComponentEvidence | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const flows = semantic.edges.filter(edge => edge.source === node.id || edge.target === node.id);
  const usedBy = [...new Map(
    flows.filter(edge => edge.target === node.id)
      .map(edge => [edge.source, semantic.nodes.find(peer => peer.id === edge.source)] as const),
  ).values()].filter((peer): peer is SemanticNode => Boolean(peer));
  const calls = [...new Map(
    flows.filter(edge => edge.source === node.id)
      .map(edge => [edge.target, semantic.nodes.find(peer => peer.id === edge.target)] as const),
  ).values()].filter((peer): peer is SemanticNode => Boolean(peer));

  return (
    <article className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold">{node.label}</h3>
        <Badge variant="secondary">{roleLabel(node)}</Badge>
      </div>
      <p className="mt-1.5 max-w-3xl text-sm leading-6">{node.description}</p>
      {node.technologies.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {node.technologies.map(technology => <Badge key={technology} variant="outline" className="font-normal">{technology}</Badge>)}
        </div>
      )}
      <p className="mt-2.5 text-xs text-muted-foreground">
        {node.files.length} source file{node.files.length === 1 ? "" : "s"} · {flows.length} connection{flows.length === 1 ? "" : "s"}
      </p>
      {node.type === "database" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Resources: {node.sourceNodeIds.flatMap(id => {
            const resources = architectureEvidence(rawGraph).nodes.find(source => source.id === id)?.metadata?.resources;
            return Array.isArray(resources) ? resources : [];
          }).join(", ") || "See source schema"}
        </p>
      )}
      <details className="mt-3 rounded-lg border text-xs" onToggle={event => setDetailsOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer px-3 py-2 font-medium focus-visible:outline-2">Details &amp; evidence</summary>
        <div className="space-y-3 border-t px-3 py-3">
          {(usedBy.length > 0 || calls.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 font-medium text-muted-foreground">Used by</p>
                {usedBy.length ? (
                  <div className="flex flex-wrap gap-1">{usedBy.map(peer => <span key={peer.id} className="rounded-full border px-2 py-0.5">{peer.label}</span>)}</div>
                ) : <p className="text-muted-foreground">Not used by any other detected component.</p>}
              </div>
              <div>
                <p className="mb-1.5 font-medium text-muted-foreground">Depends on</p>
                {calls.length ? (
                  <div className="flex flex-wrap gap-1">{calls.map(peer => <span key={peer.id} className="rounded-full border px-2 py-0.5">{peer.label}</span>)}</div>
                ) : <p className="text-muted-foreground">Does not call any other detected component.</p>}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 font-medium text-muted-foreground">Evidence</p>
            {detailsOpen && (
              <>
                <EvidenceLoader key={attempt} repositoryId={repositoryId} componentId={node.id} onData={setEvidence} onError={setEvidenceError} />
                <EvidencePanel evidence={evidence} error={evidenceError} onRetry={() => setAttempt(value => value + 1)} />
              </>
            )}
          </div>
          <p className="text-muted-foreground">
            Source files: <span className="break-all font-mono">{node.files.join(", ") || "none recorded"}</span>
          </p>
          <p className="text-muted-foreground">
            Confidence: {Math.round(node.confidence * 100)}% — the model&apos;s assessment of this grouping, not proof of runtime behavior.
          </p>
        </div>
      </details>
    </article>
  );
}

export function ComponentIndex({ architecture, repositoryId }: { architecture: StoredArchitecture; repositoryId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const semantic = architecture.semanticGraph
    ? reconcileSemanticRoles(architecture.semanticGraph, architectureEvidence(architecture.rawGraph).nodes)
    : null;
  const rawNodes = architectureEvidence(architecture.rawGraph).nodes;

  const roles = semantic ? [...new Set(semantic.nodes.map(roleLabel))] : [];
  const filtered = semantic ? semantic.nodes.filter(node => {
    if (roleFilter && roleLabel(node) !== roleFilter) return false;
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return node.label.toLowerCase().includes(query) || node.technologies.some(technology => technology.toLowerCase().includes(query));
  }) : [];

  const total = semantic ? filtered.length : rawNodes.length;
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const activePage = Math.min(page, pageCount);
  const offset = (activePage - 1) * pageSize;
  const visiblePages = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter(value => pageCount <= 7 || value === 1 || value === pageCount || Math.abs(value - activePage) <= 1);
  function goToPage(next: number) {
    if (next === activePage) return;
    setPage(Math.max(1, Math.min(next, pageCount)));
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return (
    <>
      <h2 ref={heading} tabIndex={-1} className="mb-1 scroll-mt-8 text-lg font-semibold outline-none">Components</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {semantic
          ? "The major parts of this repository and what they do."
          : "Detected components and their source evidence. Generate architecture to see plain-English descriptions."}
      </p>
      {semantic && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search by name or technology"
              className="h-8 pl-8 text-xs"
              aria-label="Search components"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant={roleFilter === null ? "secondary" : "ghost"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => { setRoleFilter(null); setPage(1); }}>
              All
            </Button>
            {roles.map(role => (
              <Button key={role} variant={roleFilter === role ? "secondary" : "ghost"} size="sm" className="h-7 px-2.5 text-xs"
                onClick={() => { setRoleFilter(current => current === role ? null : role); setPage(1); }}>
                {role}
              </Button>
            ))}
          </div>
        </div>
      )}
      {semantic ? (
        <div className="divide-y rounded-lg border">
          {filtered.length ? filtered.slice(offset, offset + pageSize).map(node => (
            <ComponentRow key={node.id} node={node} repositoryId={repositoryId} semantic={semantic} rawGraph={architecture.rawGraph} />
          )) : <p className="p-5 text-sm text-muted-foreground">No components match this search/filter.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>{["Component", "Type", "Evidence"].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {rawNodes.slice(offset, offset + pageSize).map(node => (
                <tr key={node.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{node.label}</td>
                  <td className="px-4 py-3"><Badge variant="secondary">{node.type}</Badge></td>
                  <td className="break-all px-4 py-3 font-mono text-xs text-muted-foreground">
                    {(Array.isArray(node.metadata?.evidence) ? node.metadata.evidence : [String(node.metadata?.evidence ?? node.path ?? "—")]).map(file => <div key={file}>{file}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {total ? `${offset + 1}–${Math.min(offset + pageSize, total)} of ${total} components` : "No components"}
        </p>
        {pageCount > 1 && (
          <nav aria-label="Component index pages" className="flex max-w-full items-center gap-0.5 overflow-x-auto">
            <Button variant="ghost" size="icon-sm" disabled={activePage === 1} aria-label="Previous component page" onClick={() => goToPage(activePage - 1)}><ChevronLeft /></Button>
            {visiblePages.map((value, index) => (
              <span key={value} className="flex items-center gap-0.5">
                {index > 0 && value - visiblePages[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-muted-foreground">…</span>}
                <Button variant={value === activePage ? "outline" : "ghost"} size="icon-sm" aria-label={`Component page ${value}`} aria-current={value === activePage ? "page" : undefined} onClick={() => goToPage(value)}>{value}</Button>
              </span>
            ))}
            <Button variant="ghost" size="icon-sm" disabled={activePage === pageCount} aria-label="Next component page" onClick={() => goToPage(activePage + 1)}><ChevronRight /></Button>
          </nav>
        )}
      </div>
    </>
  );
}
