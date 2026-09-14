import { notFound, redirect } from 'next/navigation';
import RepositoryPage from '@/components/repository-page';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/get-session';
import type { StoredArchitecture } from '@/lib/architecture/types';
import type { Analysis } from '@/lib/repository-analysis';
import type { GeneratedReadme } from '@/lib/readme/types';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const repository = await prisma.repository.findUnique({ where: { id }, include: { architecture: true, readme: true } });
  if (!repository || repository.userId !== session.user.id) notFound();
  return <RepositoryPage key={id} repository={{
    architecture: repository.architecture ? { rawGraph: repository.architecture.rawGraph, semanticGraph: repository.architecture.semanticGraph, generatedAt: repository.architecture.generatedAt?.toISOString() ?? null } as StoredArchitecture : null,
    readme: repository.readme ? { model: repository.readme.model as GeneratedReadme, markdown: repository.readme.markdown, generatedAt: repository.readme.generatedAt?.toISOString() ?? null } : null,
    id: repository.id, fullName: repository.fullName, defaultBranch: repository.defaultBranch,
    status: repository.status, analysis: repository.analysis as Analysis | null,
    analysisError: repository.analysisError, analyzedAt: repository.analyzedAt?.toISOString() ?? null,
    analysisStartedAt: repository.analysisStartedAt?.toISOString() ?? null,
  }} />;
}
