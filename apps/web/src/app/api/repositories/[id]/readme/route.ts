import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CodeEvidenceError } from "@/lib/architecture/fetch-repository-source";
import { buildReadmeContext } from "@/lib/readme/build-context";
import { generateReadmeProse } from "@/lib/ai/generate-readme-prose";
import { assembleGeneratedReadme } from "@/lib/readme/assemble-readme";
import {
  renderReadmeMarkdown,
  V1_SECTION_ORDER,
} from "@/lib/readme/render-markdown";
import { readmeLimiter, rateLimitResponse } from "@/lib/rate-limit";
import type { ArchitectureGraph } from "@/lib/architecture/types";
import type { SemanticArchitecture } from "@/lib/architecture/semantic-schema";
import type { Analysis } from "@/lib/repository-analysis";
import type { GeneratedReadme, ReadmeSectionKey } from "@/lib/readme/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Only these three sections come from the AI pass — regenerating any other
// section is a pure recompute from already-verified data, no model call.
const AI_SECTIONS = new Set<ReadmeSectionKey>([
  "hero",
  "tagline",
  "overview",
  "architecture",
  "keyFlows",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const respond = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  const { id } = await params;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return respond({ error: "Sign in to generate a README." }, 401);

    const repository = await prisma.repository.findFirst({
      where: { id, userId: session.user.id },
      include: { architecture: true, readme: true },
    });
    if (!repository) return respond({ error: "Repository not found." }, 404);
    const semanticGraph = repository.architecture?.semanticGraph as
      | SemanticArchitecture
      | null
      | undefined;
    if (!semanticGraph)
      return respond({ error: "Generate architecture first." }, 409);
    const analysis = repository.analysis as Analysis | null;
    if (!analysis)
      return respond(
        { error: "Analyze this repository before generating a README." },
        409,
      );

    const body = await request.json().catch(() => null);
    const force = body?.force === true;
    const rawSection =
      typeof body?.section === "string" ? body.section : undefined;
    const section =
      rawSection && (V1_SECTION_ORDER as string[]).includes(rawSection)
        ? (rawSection as ReadmeSectionKey)
        : undefined;

    if (!force && !section && repository.readme) {
      return respond({
        model: repository.readme.model,
        markdown: renderReadmeMarkdown(
          repository.readme.model as GeneratedReadme,
        ),
        generatedAt: repository.readme.generatedAt,
      });
    }

    const limit = await readmeLimiter.limit(session.user.id);
    if (!limit.success) return rateLimitResponse(limit);

    const rawGraph = repository.architecture!.rawGraph as ArchitectureGraph;
    const context = await buildReadmeContext({
      repository: {
        owner: repository.owner,
        name: repository.name,
        treeSha: analysis.treeSha,
      },
      analysis,
      semantic: semanticGraph,
      rawGraph,
    });

    const existing = repository.readme?.model as GeneratedReadme | undefined;
    const generatedAt = new Date();
    const meta = {
      generatedAt: generatedAt.toISOString(),
      sourceSemanticGeneratedAt:
        repository.architecture?.generatedAt?.toISOString() ?? null,
    };

    let model: GeneratedReadme;
    if (section && existing && !force) {
      if (AI_SECTIONS.has(section)) {
        const prose = await generateReadmeProse(context);
        const assembled = assembleGeneratedReadme(context, prose, meta);
        model =
          section === "hero"
            ? {
                ...existing,
                title: assembled.title,
                tagline: assembled.tagline,
                badges: assembled.badges,
                generatedAt: meta.generatedAt,
              }
            : {
                ...existing,
                [section]: assembled[section as keyof GeneratedReadme],
                generatedAt: meta.generatedAt,
              };
      } else {
        // Deterministic section: title/badges/architecture/components/codeExamples/
        // techStack/projectStructure/gettingStarted are already just `context`'s
        // own fields — no AI call needed to "regenerate" them, only fresh data.
        const deterministicValue: Record<string, unknown> = {
          title: context.title,
          badges: context.badges,
          architecture: context.architecture,
          components: context.components,
          codeExamples: context.codeExamples,
          techStack: context.techStack,
          projectStructure: context.projectStructure,
          gettingStarted: context.gettingStarted,
        };
        model =
          section === "implementationHighlights"
            ? {
                ...existing,
                codeExamples: context.codeExamples,
                generatedAt: meta.generatedAt,
              }
            : {
                ...existing,
                [section]: deterministicValue[section],
                generatedAt: meta.generatedAt,
              };
      }
    } else {
      const prose = await generateReadmeProse(context);
      model = assembleGeneratedReadme(context, prose, meta);
    }

    const markdown = renderReadmeMarkdown(model);
    const saved = await prisma.readme.upsert({
      where: { repositoryId: id },
      create: { repositoryId: id, model, markdown, generatedAt },
      update: { model, markdown, generatedAt },
    });
    return respond({
      model: saved.model,
      markdown: saved.markdown,
      generatedAt: saved.generatedAt,
    });
  } catch (error) {
    console.error("Readme generation failed", error);
    if (error instanceof CodeEvidenceError)
      return respond({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : "";
    const expected =
      /^(Cannot reach Ollama|Ollama model|Local model|Readme prose validation|Missing AI|Unsupported AI_PROVIDER|Hosted model|Cannot reach the hosted)/.test(
        message,
      );
    return respond(
      {
        error: expected
          ? message
          : "README generation failed validation or could not be saved. Dependencies are still available.",
      },
      422,
    );
  }
}
