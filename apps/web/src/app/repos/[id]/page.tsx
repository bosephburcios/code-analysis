import { notFound } from 'next/navigation';
import RepositoryPage from '@/components/repository-page';
import { prisma } from '@/lib/prisma';
import type { Analysis } from '@/lib/repository-analysis';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository) notFound();
  return <RepositoryPage key={id} repository={{
    id: repository.id, fullName: repository.fullName, defaultBranch: repository.defaultBranch,
    status: repository.status, analysis: repository.analysis as Analysis | null,
    analysisError: repository.analysisError, analyzedAt: repository.analyzedAt?.toISOString() ?? null,
    analysisStartedAt: repository.analysisStartedAt?.toISOString() ?? null,
  }} />;
}
