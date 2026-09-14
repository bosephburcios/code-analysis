import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CodeEvidenceError, loadComponentEvidence } from '@/lib/architecture/load-component-evidence';
import { architectureEvidence, type ArchitectureGraph } from '@/lib/architecture/types';
import { reconcileSemanticRoles } from '@/lib/architecture/semantic-roles';
import type { SemanticArchitecture } from '@/lib/architecture/semantic-schema';

export const runtime = 'nodejs';
export const maxDuration = 45;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return respond({ error: 'Sign in to inspect evidence.' }, 401);
    const { id } = await params;
    const repository = await prisma.repository.findFirst({
      where: { id, userId: session.user.id },
      select: { owner: true, name: true, analysis: true, architecture: { select: { rawGraph: true, semanticGraph: true } } },
    });
    if (!repository?.architecture?.semanticGraph) return respond({ error: 'Repository architecture not found.' }, 404);

    const componentId = new URL(request.url).searchParams.get('component') ?? '';
    const rawGraph = repository.architecture.rawGraph as ArchitectureGraph;
    // Reconcile the same way the client does, so the plan's inferred `kind`
    // always matches what the canvas/header already show for this node.
    const semantic = reconcileSemanticRoles(
      repository.architecture.semanticGraph as SemanticArchitecture,
      architectureEvidence(rawGraph).nodes,
    );
    const node = semantic.nodes.find(node => node.id === componentId);
    if (!node) return respond({ error: 'Component not found in this architecture.' }, 404);

    const analysis = repository.analysis as { treeSha?: string } | null;
    const treeSha = analysis?.treeSha ?? '';
    return respond(await loadComponentEvidence({ owner: repository.owner, name: repository.name, treeSha, graph: rawGraph, node }));
  } catch (error) {
    return respond({ error: error instanceof CodeEvidenceError ? error.message : 'Could not load evidence. Please try again.' },
      error instanceof CodeEvidenceError ? error.status : 502);
  }
}
