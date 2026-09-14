import type { ReadmeContext } from "./build-context.ts";
import type { ReadmeProse } from "./readme-prose-schema.ts";
import type { GeneratedReadme } from "./types.ts";
import { flowImagePath, slugifyFlowTitle } from "./paths.ts";

// Pure merge: every deterministic field passes through untouched; only
// tagline/overview/per-flow title+description come from the (already
// id-validated) AI prose.
export function assembleGeneratedReadme(
  context: ReadmeContext,
  prose: ReadmeProse,
  meta: { generatedAt: string; sourceSemanticGeneratedAt: string | null },
): GeneratedReadme {
  const usedSlugs = new Set<string>();
  const proseByFlowId = new Map(prose.flows.map((flow) => [flow.id, flow]));
  return {
    version: 1,
    title: context.title,
    tagline: prose.tagline,
    badges: context.badges,
    overview: prose.overview,
    architecture: { ...context.architecture, description: prose.architectureSummary },
    keyFlows: context.candidateFlows.map((flow) => {
      const proseFlow = proseByFlowId.get(flow.id);
      if (!proseFlow)
        throw new Error(
          `Readme prose validation failed: missing flow ${flow.id}.`,
        );
      const slug = slugifyFlowTitle(proseFlow.title, usedSlugs);
      return {
        id: flow.id,
        slug,
        title: proseFlow.title,
        description: proseFlow.description,
        nodeIds: flow.nodeIds,
        edgeIds: flow.edgeIds,
        nodeLabels: flow.nodeLabels,
        imagePath: flowImagePath(slug),
      };
    }),
    components: context.components,
    codeExamples: context.codeExamples,
    techStack: context.techStack,
    projectStructure: context.projectStructure,
    gettingStarted: context.gettingStarted,
    generatedAt: meta.generatedAt,
    sourceSemanticGeneratedAt: meta.sourceSemanticGeneratedAt,
  };
}
