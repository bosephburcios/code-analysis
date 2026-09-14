"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { architectureEvidence, type ArchitectureGraph } from "@/lib/architecture/types";
import type { SemanticArchitecture, SemanticNode } from "@/lib/architecture/semantic-schema";
import type { ComponentEvidence } from "@/lib/architecture/evidence-types";
import { EvidenceLoader, EvidencePanel } from "./evidence-panel";

function inferredRationale(node: SemanticNode, sourceCount: number, usedByCount: number, callsCount: number) {
  const files = sourceCount === 1 ? "1 source file" : `${sourceCount} source files`;
  const used = usedByCount ? `used by ${usedByCount} other component${usedByCount === 1 ? "" : "s"}` : "not used by another detected component";
  const calling = callsCount ? `calls ${callsCount} other component${callsCount === 1 ? "" : "s"}` : "does not call another detected component";
  return `Grouped from ${files} into one ${node.type} responsibility. It is ${used} and ${calling} in this architecture.`;
}

function InspectorBody({ repositoryId, node, semantic, rawGraph, onSelect }: {
  repositoryId: string; node: SemanticNode; semantic: SemanticArchitecture; rawGraph: ArchitectureGraph; onSelect: (id: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [evidence, setEvidence] = useState<ComponentEvidence | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const raw = architectureEvidence(rawGraph);
  const rawEdges = new Map(raw.edges.map(edge => [edge.id, edge]));
  const flows = semantic.edges.filter(edge => edge.source === node.id || edge.target === node.id);
  const sourceNodes = raw.nodes.filter(source => node.sourceNodeIds.includes(source.id));

  const usedBy = [...new Map(
    flows.filter(edge => edge.target === node.id)
      .map(edge => [edge.source, semantic.nodes.find(peer => peer.id === edge.source)] as const),
  ).values()].filter((peer): peer is SemanticNode => Boolean(peer));

  const calls = [...new Map(
    flows.filter(edge => edge.source === node.id)
      .map(edge => [edge.target, semantic.nodes.find(peer => peer.id === edge.target)] as const),
  ).values()].filter((peer): peer is SemanticNode => Boolean(peer));

  const requests = evidence ? [...new Map(
    evidence.items
      .filter(item => (item.kind === "external_api" || item.kind === "ai_service") && item.endpoint)
      .map(item => [`${item.method} ${item.endpoint}`, item]),
  ).keys()] : [];

  return <div className="space-y-7 p-5 pt-0 sm:p-6 sm:pt-0">
    <section aria-label="Why it exists" className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">Why it exists</h3>
      <p className="text-sm leading-6 text-muted-foreground">{node.rationale ?? inferredRationale(node, sourceNodes.length, usedBy.length, calls.length)}</p>
    </section>

    <section aria-label="Used by" className="border-t pt-5 space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">Used by</h3>
      {usedBy.length ? (
        <div className="flex flex-wrap gap-1.5">
          {usedBy.map(peer => (
            <button key={peer.id} onClick={() => onSelect(peer.id)}
              className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
              {peer.label}
            </button>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Not used by any other detected component.</p>}
    </section>

    <section aria-label="Calls" className="border-t pt-5 space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">Calls</h3>
      {calls.length ? (
        <div className="flex flex-wrap gap-1.5">
          {calls.map(peer => (
            <button key={peer.id} onClick={() => onSelect(peer.id)}
              className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
              {peer.label}
            </button>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Does not call any other detected component.</p>}
    </section>

    <section className="border-t pt-5" aria-label="Requests">
      <h3 className="text-xs font-medium text-muted-foreground">Requests</h3>
      {requests.length ? (
        <ul className="mt-2 space-y-1">
          {requests.map(request => <li key={request} className="break-all font-mono text-xs">{request}</li>)}
        </ul>
      ) : <p className="mt-2 text-sm text-muted-foreground">No outbound requests detected for this component.</p>}
    </section>

    <section aria-label="Technologies" className="border-t pt-5 space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">Technologies</h3>
      <div className="flex flex-wrap gap-1.5">{node.technologies.length ? node.technologies.map(technology => <Badge key={technology} variant="secondary" className="font-normal">{technology}</Badge>) : <span className="text-sm text-muted-foreground">No technologies identified.</span>}</div>
    </section>
    <section className="border-t pt-5" aria-label="Confidence and evidence">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Confidence & evidence</h3><Badge variant="outline">{node.confidence >= 0.8 ? "High" : node.confidence >= 0.6 ? "Moderate" : "Low"} confidence · {Math.round(node.confidence * 100)}%</Badge></div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Model confidence in this grouping, supported by {sourceNodes.length} detected components and {node.files.length} files. Connections are inferred from source, not verified runtime traffic.</p>
      <details className="mt-3 rounded-lg border">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Detected components ({sourceNodes.length})</summary>
        <ul className="divide-y border-t">{sourceNodes.map(source => <li key={source.id} className="px-3 py-2"><p className="text-xs font-medium">{source.label}</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{source.path}</p></li>)}</ul>
      </details>
    </section>
    <section className="border-t pt-5" aria-label="Connections">
      <h3 className="text-sm font-semibold">Connections <span className="ml-1 font-normal text-muted-foreground">{flows.length}</span></h3>
      <div className="mt-3 divide-y overflow-hidden rounded-lg border">
        {flows.length ? flows.map(edge => {
          const outgoing = edge.source === node.id;
          const peer = semantic.nodes.find(peer => peer.id === (outgoing ? edge.target : edge.source));
          const evidence = [...new Set(edge.sourceEdgeIds.flatMap(id => rawEdges.get(id)?.evidence ?? []))];
          const Icon = outgoing ? ArrowUpRight : ArrowDownLeft;
          return <details key={edge.id} className="group">
            <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-3 hover:bg-muted/40">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="block text-xs font-medium">{edge.label}</span><span className="mt-1 block text-[11px] text-muted-foreground">{outgoing ? "To" : "From"} {peer?.label ?? "Unknown component"} · {edge.type}</span></span>
              <span aria-hidden="true" className="text-muted-foreground group-open:rotate-90">›</span>
            </summary>
            <div className="space-y-2 border-t bg-muted/15 px-3 py-3">
              {peer && <Button variant="outline" size="sm" className="h-auto whitespace-normal text-left" onClick={() => onSelect(peer.id)}>Inspect {peer.label}</Button>}
              <p className="text-[11px] font-medium text-muted-foreground">Source evidence</p>
              {evidence.length ? evidence.map(reference => <p key={reference} className="break-all font-mono text-[11px] text-muted-foreground">{reference}</p>) : <p className="text-xs text-muted-foreground">Structural relationship; no call-site lines recorded.</p>}
            </div>
          </details>;
        }) : <p className="p-3 text-xs text-muted-foreground">No incoming or outgoing flows were detected.</p>}
      </div>
    </section>
    <section className="border-t pt-5" aria-label="Evidence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Evidence</h3>
        {evidence && evidence.totalReferences > 0 && (
          <span className="text-[11px] text-muted-foreground">{evidence.totalReferences} reference{evidence.totalReferences === 1 ? "" : "s"} found</span>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">The smallest code fragments that prove this component’s role — not full files.</p>
      <div className="mt-3">
        <EvidenceLoader key={attempt} repositoryId={repositoryId} componentId={node.id} onData={setEvidence} onError={setEvidenceError} />
        <EvidencePanel evidence={evidence} error={evidenceError} onRetry={() => setAttempt(value => value + 1)} />
      </div>
    </section>
  </div>;
}

export function SemanticInspector({ repositoryId, node, semantic, rawGraph, onSelect, onClose }: {
  repositoryId: string; node: SemanticNode | null; semantic: SemanticArchitecture; rawGraph: ArchitectureGraph;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const mobile = useIsMobile();
  // Keep rendering the last-open node's content while the sheet plays its
  // closing transition — clearing it immediately on close collapses the
  // auto-height panel to empty before the slide-out animation can run,
  // which reads as an instant close instead of a smooth slide-down.
  const [displayNode, setDisplayNode] = useState(node);
  if (node && node !== displayNode) setDisplayNode(node);
  return <Sheet open={!!node} modal={mobile} onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent
      side={mobile ? "bottom" : "right"}
      showOverlay={mobile}
      className={mobile
        ? "max-h-[85svh] w-full overflow-y-auto gap-6 rounded-t-2xl motion-reduce:transition-none"
        : "data-[side=right]:w-full sm:max-w-[540px] xl:max-w-[580px] overflow-y-auto gap-6 motion-reduce:transition-none"}
    >
      {displayNode && <>
        <SheetHeader className="border-b p-5 pr-12 sm:p-6 sm:pr-12">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Component reference / {displayNode.type}</p>
          <SheetTitle className="text-xl font-semibold tracking-tight">{displayNode.label}</SheetTitle>
          <SheetDescription className="mt-3 text-sm leading-6">{displayNode.description}</SheetDescription>
        </SheetHeader>
        <InspectorBody key={displayNode.id} repositoryId={repositoryId} node={displayNode} semantic={semantic} rawGraph={rawGraph} onSelect={onSelect} />
      </>}
    </SheetContent>
  </Sheet>;
}
