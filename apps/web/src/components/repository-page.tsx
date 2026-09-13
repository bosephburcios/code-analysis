'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, GitBranch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import RepositoryOverview from '@/components/repository-overview';
import type { Analysis } from '@/lib/repository-analysis';

type WorkspaceRepository = {
  id: string; fullName: string; defaultBranch: string;
  status: string; analysis: Analysis | null; analysisError: string | null;
  analyzedAt: string | null; analysisStartedAt: string | null;
};

export default function RepositoryPage({ repository }: { repository: WorkspaceRepository }) {
  const [current, setCurrent] = useState(repository);
  const [attempt, setAttempt] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function run(method: 'GET' | 'POST') {
      if (!active) return;
      setBusy(true);
      try {
        const response = await fetch(`/api/repositories/${repository.id}/analysis`, { method, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Unable to load analysis. Please retry.');
        if (!active) return;
        if (data.id) setCurrent(data);
        if (data.status === 'ANALYZING') {
          const stale = data.analysisStartedAt && Date.now() - Date.parse(data.analysisStartedAt) > 120_000;
          timer = setTimeout(() => void run(stale ? 'POST' : 'GET'), 2000);
        } else setBusy(false);
      } catch (error) {
        if (active) {
          setRequestError(error instanceof Error ? error.message : 'Unable to load analysis.');
          setBusy(false);
        }
      }
    }
    if (attempt > 0 || repository.status === 'IMPORTED') void run('POST');
    else if (repository.status === 'ANALYZING') void run('GET');
    return () => { active = false; clearTimeout(timer); };
  }, [repository.id, repository.status, attempt]);

  const analysis = current.analysis;
  const error = requestError ?? current.analysisError;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Import repository</Link>
      <header className="my-8 flex flex-wrap items-center justify-between gap-4">
        <div><p className="mb-2 text-sm text-muted-foreground">Repository workspace</p><h1 className="break-all text-3xl font-semibold tracking-tight">{current.fullName}</h1></div>
        <Badge variant="secondary"><GitBranch className="mr-1 size-3.5" />{current.defaultBranch}</Badge>
      </header>
      {(busy || (!error && current.status === 'IMPORTED')) && <div role="status" className="flex items-center gap-3 rounded-lg border p-6"><Loader2 className="size-5 animate-spin" /><div><p className="font-medium">Analyzing repository</p><p className="text-sm text-muted-foreground">Reading the file tree and detecting languages and tools…</p></div></div>}
      {error && !busy && <div role="alert" className="rounded-lg border p-6"><h2 className="font-semibold">Analysis couldn’t finish</h2><p className="my-3 text-sm text-muted-foreground">{error}</p><Button onClick={() => { setRequestError(null); setAttempt(value => value + 1); }}>Retry analysis</Button></div>}
      {analysis && <RepositoryOverview analysis={analysis} analyzedAt={current.analyzedAt} />}
    </main>
  );
}
