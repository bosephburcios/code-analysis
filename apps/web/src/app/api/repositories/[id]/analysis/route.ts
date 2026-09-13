import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ingestRepository } from '@/lib/repository-analysis';

export const runtime = 'nodejs';
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository) return NextResponse.json({ error: 'Repository not found.' }, { status: 404 });
  return NextResponse.json(repository, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository) return NextResponse.json({ error: 'Repository not found.' }, { status: 404 });
  if (repository.status === 'READY' && repository.analysis) return NextResponse.json(repository);
  const startedAt = new Date();
  const claimed = await prisma.repository.updateMany({
    where: { id, OR: [
      { status: { in: ['IMPORTED', 'FAILED'] } },
      { status: 'ANALYZING', analysisStartedAt: { lt: new Date(Date.now() - 120_000) } },
      { status: 'ANALYZING', analysisStartedAt: null },
    ] },
    data: { status: 'ANALYZING', analysisStartedAt: startedAt, analysisError: null },
  });
  if (!claimed.count) return NextResponse.json({ status: 'ANALYZING' }, { status: 202 });
  try {
    const analysis = await ingestRepository(repository.owner, repository.name, repository.defaultBranch);
    await prisma.repository.updateMany({
      where: { id, status: 'ANALYZING', analysisStartedAt: startedAt },
      data: { analysis, status: 'READY', analyzedAt: new Date(), analysisError: null },
    });
  } catch (error) {
    const message = error instanceof Error && error.name !== 'TimeoutError'
      ? error.message : 'Analysis timed out. Please retry.';
    await prisma.repository.updateMany({
      where: { id, status: 'ANALYZING', analysisStartedAt: startedAt },
      data: { status: 'FAILED', analysisError: message },
    });
  }
  return NextResponse.json(await prisma.repository.findUnique({ where: { id } }));
}
