"use client";

import { FormEvent, useRef, useState } from "react";
import {
  ArrowRight,
  GitBranch,
  GitFork,
  Loader2,
  Star,
} from "lucide-react";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GitHubIcon } from "@/components/icons/github-icon";
import { NetworkIcon } from "@/components/icons/network-icon";

type Repository = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  githubUrl: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  stars: number;
  forks: number;
  visibility: string;
};

type RecentRepository = {
  id: string;
  fullName: string;
  githubUrl: string;
  language: string | null;
  updatedAt: Date;
};

function timeAgo(date: Date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function RepositoryImport({
  recentRepositories = [],
}: {
  recentRepositories?: RecentRepository[];
}) {
  const [url, setUrl] = useState("");
  const [repository, setRepository] = useState<Repository | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formPanel = useRef<HTMLDivElement>(null);

  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/repositories/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to import repository.");
      }

      // Already imported before (has gone through analysis at least once):
      // re-importing behaves like the "Sync latest" action on the repo page,
      // pulling fresh metadata and re-running analysis in the background.
      if (data.status !== "IMPORTED") {
        fetch(`/api/repositories/${data.id}/analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        }).catch(() => {});
      }

      if (formPanel.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const exit = formPanel.current.animate(
          [
            { opacity: 1, transform: "translateY(0)" },
            { opacity: 0, transform: "translateY(-8px)" },
          ],
          { duration: 180, easing: "ease-in", fill: "forwards" },
        );
        await exit.finished.catch(() => {});
      }
      setRepository(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (repository) {
    return (
      <div key="success" className="import-success w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="import-success-icon mx-auto mb-4 flex size-10 items-center justify-center rounded-full border">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path className="import-success-check" pathLength="1" d="m5 12 4 4L19 6" />
            </svg>
          </div>

          <h1 tabIndex={-1} ref={(node) => node?.focus({ preventScroll: true })} className="text-2xl font-semibold tracking-tight outline-none">
            Repository imported
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Your repository is ready to explore.
          </p>
        </div>

        <div className="import-success-details rounded-lg border">
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <GitFork className="mt-1 size-5 shrink-0" />

                <div>
                  <h2 className="font-medium">{repository.fullName}</h2>

                  {repository.description && (
                    <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                      {repository.description}
                    </p>
                  )}
                </div>
              </div>

              <Badge variant="secondary">{repository.visibility}</Badge>
            </div>

            <Separator className="my-6" />

            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <span>
                <span className="text-muted-foreground">Language </span>
                {repository.language ?? "Unknown"}
              </span>

              <span className="flex items-center gap-1.5">
                <GitBranch className="size-3.5 text-muted-foreground" />
                {repository.defaultBranch}
              </span>

              <span className="flex items-center gap-1.5">
                <Star className="size-3.5 text-muted-foreground" />
                {repository.stars.toLocaleString()}
              </span>

              <span>
                <span className="text-muted-foreground">Forks </span>
                {repository.forks.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t p-4">
            <Button
              variant="ghost"
              onClick={() => {
                setRepository(null);
                setUrl("");
              }}
            >
              Import another
            </Button>

            <Button onClick={() => router.push(`/repos/${repository.id}`)}>
              Explore repository
              <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key="form" ref={formPanel} className="w-full max-w-2xl text-center" aria-busy={loading}>
      <div className="animate-float mx-auto mb-6 flex size-11 items-center justify-center rounded-lg border bg-muted">
        <NetworkIcon className="text-muted-foreground" />
      </div>

      <h1 className="text-4xl font-semibold tracking-tight">
        Understand any codebase.
      </h1>

      <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
        Turn a repository into an interactive architecture map you can explore,
        trace, and document.
      </p>

      <form onSubmit={handleSubmit} className="mx-auto mt-8 max-w-xl">
        <div className="flex gap-2">
          <Input
            type="url"
            value={url}
            required
            disabled={loading}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/owner/repository"
            className="h-11 bg-background transition-shadow focus-visible:border-blue-700 focus-visible:ring-blue-700/25 dark:focus-visible:border-blue-500 dark:focus-visible:ring-blue-500/30"
          />

          <Button
            type="submit"
            className="h-11 bg-blue-600 text-white hover:bg-blue-500"
            disabled={!url || loading}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" />
                Importing
              </>
            ) : (
              <>
                Import
                <ArrowRight />
              </>
            )}
          </Button>
        </div>

        {loading && (
          <p className="mt-4 text-sm text-muted-foreground">
            Checking repository…
          </p>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        {!loading && !error && (
          <p className="mt-4 text-xs text-muted-foreground">
            Public GitHub repositories only for now.
          </p>
        )}
      </form>

      {recentRepositories.length > 0 && (
        <div className="mx-auto mt-10 max-w-xl text-left">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Recent
          </p>
          <div className="flex flex-col gap-1">
            {recentRepositories.map((repository) => (
              <button
                key={repository.id}
                type="button"
                disabled={loading}
                onClick={() => setUrl(repository.githubUrl)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center gap-2 truncate">
                  <GitHubIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{repository.fullName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  {repository.language && <span>{repository.language}</span>}
                  <span>{timeAgo(repository.updatedAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
