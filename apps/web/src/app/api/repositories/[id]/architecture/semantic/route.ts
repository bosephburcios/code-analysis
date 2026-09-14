import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildArchitectureContext } from "@/lib/architecture/build-ai-context";
import { generateSemanticArchitecture } from "@/lib/ai/generate-semantic-architecture";
import { semanticLimiter, rateLimitResponse } from "@/lib/rate-limit";
import type { ArchitectureGraph } from "@/lib/architecture/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return NextResponse.json(
        { error: "Sign in to generate architecture." },
        { status: 401 },
      );
    const architecture = await prisma.architectureGraph.findFirst({
      where: { repositoryId: id, repository: { userId: session.user.id } },
    });
    if (!architecture)
      return NextResponse.json(
        {
          error: "Analyze this repository before generating its architecture.",
        },
        { status: 404 },
      );
    const body = await request.json().catch(() => null);
    if (architecture.semanticGraph && body?.force !== true)
      return NextResponse.json({
        semanticGraph: architecture.semanticGraph,
        generatedAt: architecture.generatedAt,
      });
    if (!(architecture.rawGraph as ArchitectureGraph | null)?.responsibilities)
      return NextResponse.json(
        {
          error:
            "Update source evidence in the workspace before generating a responsibility-level architecture.",
        },
        { status: 409 },
      );
    const limit = await semanticLimiter.limit(session.user.id);
    if (!limit.success) return rateLimitResponse(limit);
    const evidence = buildArchitectureContext(architecture.rawGraph);
    const semanticGraph = await generateSemanticArchitecture(evidence);
    const generatedAt = new Date();
    // A generation must never overwrite a newer raw analysis or another result.
    const saved = await prisma.architectureGraph.updateMany({
      where: {
        id: architecture.id,
        updatedAt: architecture.updatedAt,
        repository: { userId: session.user.id },
      },
      data: { semanticGraph, generatedAt },
    });
    if (!saved.count)
      return NextResponse.json(
        {
          error:
            "The graph changed during generation. Reload the workspace and try again.",
        },
        { status: 409 },
      );
    return NextResponse.json({ semanticGraph, generatedAt });
  } catch (error) {
    console.error("Semantic generation failed", error);
    const message = error instanceof Error ? error.message : "";
    const expected =
      /^(Cannot reach Ollama|Ollama model|Local model|Semantic evidence validation|This graph|No detected components)/.test(
        message,
      );
    return NextResponse.json(
      {
        error: expected
          ? message
          : "Semantic generation failed validation or could not be saved. Dependencies are still available.",
      },
      { status: 422 },
    );
  }
}
