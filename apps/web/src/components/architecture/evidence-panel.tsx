"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CodeExcerpt } from "@/lib/architecture/code-excerpts";
import type { ComponentEvidence, EvidenceKind } from "@/lib/architecture/evidence-types";

export const tokenColors = {
  plain: "text-foreground", keyword: "text-violet-700 dark:text-violet-300",
  string: "text-emerald-700 dark:text-emerald-300", comment: "text-muted-foreground",
  number: "text-amber-700 dark:text-amber-300",
};

export const evidenceKindLabels: Record<EvidenceKind, string> = {
  external_api: "External API", database: "Database", api_route: "API route",
  feature: "Feature", dependency: "Dependency", data_model: "Data model",
  ai_service: "AI service", ui_component: "UI component",
};

export function SourceBlock({ excerpt }: { excerpt: CodeExcerpt }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="break-words text-xs font-medium">{excerpt.label}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Lines {excerpt.startLine}–{excerpt.endLine}</p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={copied ? "Code copied" : "Copy code"} onClick={async () => {
          try { await navigator.clipboard.writeText(excerpt.code); setCopied(true); setCopyError(false); }
          catch { setCopyError(true); }
        }}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      {copyError && <p role="status" className="px-3 pt-2 text-xs text-muted-foreground">Copy unavailable. Select the code to copy it manually.</p>}
      <pre tabIndex={0} aria-label={`${excerpt.label}, lines ${excerpt.startLine} to ${excerpt.endLine}`} className="max-h-[420px] overflow-auto py-3 font-mono text-[12px] leading-6 focus-visible:outline-2 focus-visible:outline-ring">
        <code className="block min-w-max">{excerpt.tokens.map((tokens, index) => (
          <span key={index} className={`block pr-4 ${excerpt.highlightedLines.includes(excerpt.startLine + index) ? "bg-foreground/5" : ""}`}>
            <span aria-hidden="true" className="mr-4 inline-block w-11 select-none border-r pr-3 text-right text-muted-foreground/60">{excerpt.startLine + index}</span>
            {tokens.map((token, tokenIndex) => <span key={tokenIndex} className={tokenColors[token.kind]}>{token.text}</span>)}{"\n"}
          </span>
        ))}</code>
      </pre>
      {excerpt.truncated && <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Excerpt limited to 60 lines. The source continues below this range.</p>}
    </div>
  );
}

export function EvidencePanel({ evidence, error, onRetry }: { evidence: ComponentEvidence | null; error: string | null; onRetry: () => void }) {
  if (error) return <div className="rounded-lg border p-4"><p role="alert" className="text-sm text-muted-foreground">{error}</p><Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>Retry evidence</Button></div>;
  if (!evidence) return <p role="status" className="flex items-center gap-2 rounded-lg border p-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />Loading evidence…</p>;
  return <div className="space-y-3">
    <p className="text-[11px] text-muted-foreground">Analyzed snapshot <code title={evidence.treeSha}>{evidence.treeSha.slice(0, 8)}</code> · original source, not AI-generated</p>
    {evidence.items.length ? evidence.items.map(item => (
      <div key={`${item.path}:${item.startLine}`} className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">{evidenceKindLabels[item.kind]}</Badge>
          {item.reasons.length > 0 && (
            <p className="text-[11px] text-muted-foreground">{item.reasons.map(reason => reason.replace(/\s*\+\d+$/, "")).join(" · ")}</p>
          )}
        </div>
        <SourceBlock excerpt={item} />
      </div>
    )) : <p className="rounded-lg border p-4 text-sm text-muted-foreground">No representative evidence was found for this component.</p>}
  </div>;
}

export function EvidenceLoader({ repositoryId, componentId, onData, onError }: {
  repositoryId: string; componentId: string; onData: (data: ComponentEvidence) => void; onError: (message: string) => void;
}) {
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/repositories/${encodeURIComponent(repositoryId)}/architecture/evidence?component=${encodeURIComponent(componentId)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load evidence.");
        if (!controller.signal.aborted) onData(body);
      } catch (error) {
        if (!controller.signal.aborted) onError(error instanceof Error ? error.message : "Could not load evidence.");
      }
    }
    void load();
    return () => controller.abort();
  }, [repositoryId, componentId, onData, onError]);
  return null;
}
