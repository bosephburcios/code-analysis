import { NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { ingestRepository } from '@/lib/repository-analysis';
import { getSession } from '@/lib/get-session';

export const runtime = 'nodejs';
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const { id } = await params;
  const repository = await prisma.repository.findUnique({ where: { id }, include: { architecture: true } });
  if (!repository || repository.userId !== session.user.id) return NextResponse.json({ error: 'Repository not found.' }, { status: 404 });
  return NextResponse.json(repository, { headers: { 'Cache-Control': 'no-store' } });
}

async function fetchGithubMetadata(owner: string, name: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const githubRepo = await response.json();
  return {
    description: githubRepo.description as string | null,
    defaultBranch: githubRepo.default_branch as string,
    language: githubRepo.language as string | null,
    stars: githubRepo.stargazers_count as number,
    forks: githubRepo.forks_count as number,
    visibility: (githubRepo.visibility as string) ?? 'public',
  };
}

export async function POST(request: Request, { params }: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const { id } = await params;
  const repository = await prisma.repository.findUnique({ where: { id }, include: { architecture: true } });
  if (!repository || repository.userId !== session.user.id) return NextResponse.json({ error: 'Repository not found.' }, { status: 404 });

  // `force` re-pulls an already-READY repository: refreshed GitHub metadata plus a
  // fresh analysis, without discarding the previous analysis/architecture until the
  // new one actually succeeds.
  const force = await request.json().then((body) => Boolean(body?.force)).catch(() => false);

  if (!force && repository.status === 'READY' && repository.analysis && repository.architecture) return NextResponse.json(repository);
  const startedAt = new Date();
  const claimed = await prisma.repository.updateMany({
    where: { id, OR: [
      { status: { in: ['IMPORTED', 'FAILED'] } },
      { status: 'READY', architecture: { is: null } },
      { status: 'ANALYZING', analysisStartedAt: { lt: new Date(Date.now() - 120_000) } },
      { status: 'ANALYZING', analysisStartedAt: null },
      ...(force ? [{ status: 'READY' as const }] : []),
    ] },
    data: { status: 'ANALYZING', analysisStartedAt: startedAt, analysisError: null },
  });
  if (!claimed.count) return NextResponse.json({ status: 'ANALYZING' }, { status: 202 });
  try {
    const metadata = force ? await fetchGithubMetadata(repository.owner, repository.name) : null;
    const branch = metadata?.defaultBranch ?? repository.defaultBranch;
    const { architecture, ...analysis } = await ingestRepository(repository.owner, repository.name, branch);
    await prisma.$transaction(async tx => {
      const saved = await tx.repository.updateMany({
        where: { id, status: 'ANALYZING', analysisStartedAt: startedAt },
        data: { ...metadata, analysis, status: 'READY', analyzedAt: new Date(), analysisError: null },
      });
      if (!saved.count) return;
      await tx.architectureGraph.upsert({
        where: { repositoryId: id },
        create: { repositoryId: id, rawGraph: architecture },
        update: { rawGraph: architecture, semanticGraph: Prisma.DbNull, generatedAt: null },
      });
    });
  } catch (error) {
    const message = error instanceof Error && error.name !== 'TimeoutError'
      ? error.message : 'Analysis timed out. Please retry.';
    await prisma.repository.updateMany({
      where: { id, status: 'ANALYZING', analysisStartedAt: startedAt },
      data: { status: 'FAILED', analysisError: message },
    });
  }
  return NextResponse.json(await prisma.repository.findUnique({ where: { id }, include: { architecture: true } }));
}
