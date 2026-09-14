"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RepositoryOverview from "@/components/repository-overview";
import { ComponentIndex } from "@/components/architecture/component-index";
import { ArchitectureViews } from "@/components/architecture/architecture-views";
import { ReadmeView } from "@/components/readme/readme-view";
import { useRegisterRepositoryNavigation } from "@/components/workspace-navigation";
import type { StoredArchitecture } from "@/lib/architecture/types";
import type { Analysis } from "@/lib/repository-analysis";
import type { GeneratedReadme } from "@/lib/readme/types";

type WorkspaceRepository = {
  architecture: StoredArchitecture | null;
  readme: { model: GeneratedReadme; markdown: string; generatedAt: string | null } | null;
  id: string;
  fullName: string;
  defaultBranch: string;
  status: string;
  analysis: Analysis | null;
  analysisError: string | null;
  analyzedAt: string | null;
  analysisStartedAt: string | null;
};

export default function RepositoryPage({
  repository,
}: {
  repository: WorkspaceRepository;
}) {
  const [current, setCurrent] = useState(repository);
  const [attempt, setAttempt] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function run(method: "GET" | "POST") {
      if (!active) return;
      setBusy(true);
      try {
        const response = await fetch(
          `/api/repositories/${repository.id}/analysis`,
          { method, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error ?? "Unable to load analysis. Please retry.",
          );
        if (!active) return;
        // The analysis route doesn't return `readme` — preserve whatever the
        // workspace already loaded instead of letting a poll/sync response
        // silently wipe it out from `current`.
        if (data.id) setCurrent(previous => ({ ...data, readme: data.readme ?? previous.readme }));
        if (data.status === "ANALYZING") {
          const stale =
            data.analysisStartedAt &&
            Date.now() - Date.parse(data.analysisStartedAt) > 120_000;
          timer = setTimeout(() => void run(stale ? "POST" : "GET"), 2000);
        } else setBusy(false);
      } catch (error) {
        if (active) {
          setRequestError(
            error instanceof Error ? error.message : "Unable to load analysis.",
          );
          setBusy(false);
        }
      }
    }
    if (
      attempt > 0 ||
      repository.status === "IMPORTED" ||
      (repository.status === "READY" && !repository.architecture)
    )
      void run("POST");
    else if (repository.status === "ANALYZING") void run("GET");
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [repository.id, repository.status, repository.architecture, attempt]);

  const handleSync = useCallback(async () => {
    setRequestError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/repositories/${repository.id}/analysis`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to sync repository.');
      if (data.id) setCurrent(previous => ({ ...data, readme: data.readme ?? previous.readme }));
      setAttempt((value) => value + 1);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Unable to sync repository.');
      setBusy(false);
    }
  }, [repository.id]);

  const navigation = useMemo(() => ({ id: current.id, fullName: current.fullName, busy, sync: handleSync }), [current.id, current.fullName, busy, handleSync]);
  useRegisterRepositoryNavigation(navigation);

  const analysis = current.analysis;
  const error = requestError ?? current.analysisError;
  return (
    <main className="workspace-enter w-full px-4 py-6 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Repository workspace
          </p>
          <h1 className="break-all text-3xl font-semibold tracking-tight">
            {current.fullName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            <GitBranch className="mr-1 size-3.5" />
            {current.defaultBranch}
          </Badge>
        </div>
      </header>
      {(busy || (!error && current.status === "IMPORTED")) && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border p-6"
        >
          <Loader2 className="size-5 animate-spin" />
          <div>
            <p className="font-medium">Analyzing repository</p>
            <p className="text-sm text-muted-foreground">
              Reading the file tree and detecting languages and tools…
            </p>
          </div>
        </div>
      )}
      {error && !busy && (
        <div role="alert" className="rounded-lg border p-6">
          <h2 className="font-semibold">Analysis couldn’t finish</h2>
          <p className="my-3 text-sm text-muted-foreground">{error}</p>
          <Button
            onClick={() => {
              setRequestError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Retry analysis
          </Button>
        </div>
      )}
      <div className="mt-8">
        <div className="workspace-sections min-w-0 space-y-10">
          <section
            id="architecture"
            className="scroll-mt-20 md:scroll-mt-8"
            aria-labelledby="architecture-heading"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="typeset typeset-docs">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  System reference / 01
                </p>
                <h2
                  id="architecture-heading"
                  className="text-2xl font-semibold tracking-tight"
                >
                  Architecture
                </h2>
                <p className="mt-2 max-w-2xl text-muted-foreground">
                  Major components inferred from repository files and
                  configuration. Connections suggest structural relationships,
                  not verified runtime traffic.
                </p>
              </div>
              <Badge variant="outline">Evidence-backed</Badge>
            </div>
            {current.architecture ? (
              <ArchitectureViews
                refreshing={busy}
                onRefresh={() => void handleSync()}
                onGenerated={(semanticGraph, generatedAt) => setCurrent(previous => {
                  if (!previous.architecture || previous.architecture.rawGraph !== current.architecture?.rawGraph) return previous;
                  return { ...previous, architecture: { ...previous.architecture, semanticGraph, generatedAt } };
                })}
                key={current.architecture.generatedAt ?? "raw"}
                repositoryId={current.id}
                architecture={current.architecture}
              />
            ) : (
              <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
                {error
                  ? "Graph extraction could not finish. Retry analysis above."
                  : "Building the architecture graph…"}
              </div>
            )}
          </section>
          <section id="overview" className="scroll-mt-20 md:scroll-mt-8">
            {analysis ? (
              <RepositoryOverview
                analysis={analysis}
                analyzedAt={current.analyzedAt}
              />
            ) : <div className="rounded-lg border p-6"><h2 className="font-semibold">Overview</h2><p className="mt-2 text-sm text-muted-foreground">The overview will be available after analysis finishes.</p></div>}
          </section>
            <section id="components" className="scroll-mt-20 md:scroll-mt-8">
              {current.architecture ? <ComponentIndex key={current.architecture.generatedAt ?? current.analyzedAt ?? "raw"} architecture={current.architecture} repositoryId={current.id} />
                : <div className="rounded-lg border p-6"><h2 className="font-semibold">Components</h2><p className="mt-2 text-sm text-muted-foreground">Components will appear after architecture extraction finishes.</p></div>}
            </section>
            <section id="readme" className="scroll-mt-20 md:scroll-mt-8">
              <h2 className="mb-1 text-lg font-semibold">README</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                A documentation-style README generated from this repository&apos;s own analysis.
              </p>
              <ol aria-label="Add this README to your project" className="mb-6 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                <li>Press <span className="font-medium text-foreground">Export README</span> in the sidebar or <span className="font-medium text-foreground">Export package</span> below, then unzip the download.</li>
                <li>Copy <code className="text-xs">docs/architecture.png</code> into your project&apos;s <code className="text-xs">docs/</code> folder at the repository root. Create the folder if needed.</li>
                <li>Place the included <code className="text-xs">README.md</code> at the repository root, or use the Markdown tab to download it or copy and paste its contents.</li>
                <li>Commit both files so the architecture image appears on GitHub. The README points to <code className="text-xs">./docs/architecture.png</code>.</li>
              </ol>
              {current.architecture ? <ReadmeView
                key={current.architecture.generatedAt ?? "raw"}
                repositoryId={current.id}
                repositoryName={current.fullName.split("/").at(-1) ?? current.fullName}
                readme={current.readme}
                architecture={current.architecture}
                onGenerated={readme => setCurrent(previous => ({ ...previous, readme }))}
              /> : <p className="rounded-lg border p-6 text-sm text-muted-foreground">Analyze the repository and generate its architecture to create a README.</p>}
            </section>
        </div>
      </div>
    </main>
  );
}
