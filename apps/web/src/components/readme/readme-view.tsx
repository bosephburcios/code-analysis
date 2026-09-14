"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReadmePreview } from "./readme-preview";
import { ReadmeMarkdownView } from "./readme-markdown-view";
import { useReadmeExport } from "./use-readme-export";
import { useRegisterReadmeAction } from "@/components/workspace-navigation";
import { V1_SECTION_ORDER, renderReadmeMarkdown } from "@/lib/readme/render-markdown";
import { architectureEvidence, type StoredArchitecture } from "@/lib/architecture/types";
import { reconcileSemanticRoles } from "@/lib/architecture/semantic-roles";
import type { GeneratedReadme, ReadmeSectionKey } from "@/lib/readme/types";

const SECTION_LABELS: Record<ReadmeSectionKey, string> = {
  hero: "Hero", implementationHighlights: "Implementation Highlights",
  title: "Title", tagline: "Tagline", badges: "Badges", overview: "Overview",
  architecture: "Architecture", keyFlows: "How It Works", components: "Components",
  codeExamples: "Code Examples", techStack: "Tech Stack", projectStructure: "Project Structure",
  gettingStarted: "Getting Started",
};

export function ReadmeView({
  repositoryId,
  repositoryName,
  readme,
  architecture,
  onGenerated,
}: {
  repositoryId: string;
  repositoryName: string;
  readme: { model: GeneratedReadme; markdown: string; generatedAt: string | null } | null;
  architecture: StoredArchitecture;
  onGenerated: (readme: { model: GeneratedReadme; markdown: string; generatedAt: string }) => void;
}) {
  const semantic = useMemo(
    () => architecture.semanticGraph
      ? reconcileSemanticRoles(architecture.semanticGraph, architectureEvidence(architecture.rawGraph).nodes)
      : null,
    [architecture],
  );
  const [tab, setTab] = useState<"preview" | "markdown">("preview");
  const [busy, setBusy] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<ReadmeSectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { exporting, progress, error: exportError, exportPortal, exportPackage } = useReadmeExport();
  const locked = busy || regeneratingSection !== null || exporting;
  const presentationMarkdown = useMemo(() => readme ? renderReadmeMarkdown(readme.model) : '', [readme]);
  const handleExport = useCallback(() => {
    if (readme && semantic && !locked) void exportPackage(repositoryName, presentationMarkdown, semantic);
  }, [readme, semantic, locked, exportPackage, repositoryName, presentationMarkdown]);
  const exportAction = useMemo(() => ({ repositoryId, disabled: locked || !readme || !semantic, exporting, progress, error: exportError, export: handleExport }), [repositoryId, locked, readme, semantic, exporting, progress, exportError, handleExport]);
  useRegisterReadmeAction(exportAction);

  async function generate(options?: { force?: boolean; section?: ReadmeSectionKey }) {
    if (pending.current) return;
    pending.current = true;
    if (options?.section) setRegeneratingSection(options.section);
    else setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/readme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: Boolean(options?.force), section: options?.section }),
        signal: AbortSignal.timeout(330_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not generate the README.");
      onGenerated({ model: data.model, markdown: data.markdown, generatedAt: data.generatedAt });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.name !== "TimeoutError"
          ? caught.message
          : "Generation timed out. Dependencies remain available.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      setRegeneratingSection(null);
    }
  }

  if (!semantic) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Generate architecture above before generating a README — it&apos;s built from the same components and connections.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readme && (
        <div role="tablist" aria-label="README views" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {(["preview", "markdown"] as const).map((value, index) => (
            <Button
              key={value}
              ref={element => { buttons.current[index] = element; }}
              id={`readme-tab-${value}`}
              role="tab"
              aria-selected={tab === value}
              aria-controls={`readme-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              variant={tab === value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTab(value)}
              onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
                setTab(next === 0 ? "preview" : "markdown");
                buttons.current[next]?.focus();
              }}
            >
              {value === "preview" ? "Preview" : "Markdown"}
            </Button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm">{error}</p>}
      {exportError && <p role="alert" className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm">{exportError}</p>}

      {!readme ? (
        <div className="rounded-lg border bg-muted/10 px-6 py-10 text-center">
          <h3 className="font-semibold">Generate a README</h3>
          <p className="mx-auto mb-5 mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            A concise project showcase: one architecture visual, a short workflow, and a few real implementation highlights. Designed for a 2–3 minute read.
          </p>
          <Button disabled={busy} onClick={() => void generate({ force: true })}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Generating README…" : "Generate README"}
          </Button>
          {busy && (
            <p role="status" className="mt-3 text-xs text-muted-foreground">
              Fetching source evidence and running a local AI model for the summary text — this usually takes 30–90
              seconds depending on repo size.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {readme.generatedAt && `Generated ${new Date(readme.generatedAt).toLocaleString()}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={locked} onClick={() => void generate({ force: true })}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "Regenerating…" : "Regenerate"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={handleExport}
              >
                {exporting && <Loader2 className="size-4 animate-spin" />}
                {exporting ? (progress ?? "Exporting…") : "Export package"}
              </Button>
            </div>
          </div>
          {busy && (
            <p role="status" className="text-xs text-muted-foreground">
              Re-running the local model and rebuilding every section — this usually takes 30–90 seconds.
            </p>
          )}

          <div id="readme-panel-preview" role="tabpanel" aria-labelledby="readme-tab-preview" hidden={tab !== "preview"}>
            {tab === "preview" && <ReadmePreview model={readme.model} semantic={semantic} />}
          </div>
          <div id="readme-panel-markdown" role="tabpanel" aria-labelledby="readme-tab-markdown" hidden={tab !== "markdown"}>
            {tab === "markdown" && <ReadmeMarkdownView markdown={presentationMarkdown} />}
          </div>

          <details className="rounded-lg border text-sm">
            <summary className="cursor-pointer px-3 py-2 font-medium">Regenerate individual sections</summary>
            <div className="flex flex-wrap gap-1.5 border-t p-3">
              {V1_SECTION_ORDER.map(key => (
                <Button
                  key={key}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  disabled={locked}
                  onClick={() => void generate({ section: key })}
                >
                  {regeneratingSection === key && <Loader2 className="mr-1 size-3 animate-spin" />}
                  {SECTION_LABELS[key]}
                </Button>
              ))}
            </div>
          </details>
        </>
      )}
      {exportPortal}
    </div>
  );
}
