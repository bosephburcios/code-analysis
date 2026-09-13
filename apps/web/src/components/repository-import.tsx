"use client";

import { FormEvent, useState } from "react";
import {
  ArrowRight,
  Check,
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

export function RepositoryImport() {
  const [url, setUrl] = useState("");
  const [repository, setRepository] = useState<Repository | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full border">
            <Check className="size-5" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            Repository imported
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Your repository is ready to explore.
          </p>
        </div>

        <div className="rounded-lg border">
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
    <div className="w-full max-w-2xl text-center">
      <div className="mx-auto mb-6 flex size-11 items-center justify-center rounded-lg border">
        <GitFork className="size-5" />
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
            className="h-11"
          />

          <Button type="submit" className="h-11" disabled={!url || loading}>
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
    </div>
  );
}
