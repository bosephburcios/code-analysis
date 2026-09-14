"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GitBranch, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RepositoryOverview from "@/components/repository-overview";
import { ComponentIndex } from "@/components/architecture/component-index";
import { ArchitectureViews } from "@/components/architecture/architecture-views";
import type { StoredArchitecture } from "@/lib/architecture/types";
import type { Analysis } from "@/lib/repository-analysis";

type WorkspaceRepository = {
  architecture: StoredArchitecture | null;
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
        if (data.id) setCurrent(data);
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

  async function handleSync() {
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
      if (data.id) setCurrent(data);
      setAttempt((value) => value + 1);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Unable to sync repository.');
      setBusy(false);
    }
  }

  const analysis = current.analysis;
  const error = requestError ?? current.analysisError;
  return (
    <main className="workspace-enter mx-auto max-w-[1500px] px-4 py-8 sm:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Import repository
      </Link>
      <header className="my-8 flex flex-wrap items-center justify-between gap-4">
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
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={handleSync}
          >
            <RefreshCw className={busy ? "animate-spin" : undefined} />
            Sync latest
          </Button>
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
      <div className="mt-8 grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="lg:border-r lg:pr-6">
          <nav
            aria-label="Repository documentation"
            className="flex gap-4 text-sm lg:sticky lg:top-8 lg:flex-col lg:gap-1"
          >
            <p className="hidden px-3 pb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground lg:block">
              Repository docs
            </p>
            <a
              href="#architecture"
              className="rounded-md bg-muted px-3 py-2 font-medium"
            >
              Architecture
            </a>
            <a
              href="#overview"
              className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted"
            >
              Overview
            </a>
            <a
              href="#components"
              className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted"
            >
              Components
            </a>
          </nav>
        </aside>
        <div className="workspace-sections min-w-0 space-y-10">
          <section
            id="architecture"
            className="scroll-mt-8"
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
          <section id="overview" className="scroll-mt-8">
            {analysis && (
              <RepositoryOverview
                analysis={analysis}
                analyzedAt={current.analyzedAt}
              />
            )}
          </section>
          {current.architecture && (
            <section id="components" className="scroll-mt-8">
              <ComponentIndex key={current.architecture.generatedAt ?? current.analyzedAt ?? "raw"} architecture={current.architecture} repositoryId={current.id} />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
