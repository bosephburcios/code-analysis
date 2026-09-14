import { readmeProseSchemaFor } from "../readme/readme-prose-schema.ts";
import {
  readmeSystemPrompt,
  buildReadmePrompt,
} from "../readme/readme-prompt.ts";
import { validateReadmeProse } from "../readme/validate-readme-prose.ts";
import type { ReadmeContext } from "../readme/build-context.ts";
import type { ReadmeProse } from "../readme/readme-prose-schema.ts";
import { ollamaProvider as ollamaStructuredProvider } from "./providers/ollama.ts";
import { getAIProvider, type AIProvider } from "./provider.ts";

function toPayload(context: ReadmeContext) {
  return {
    title: context.title,
    components: context.components.map((component) => ({
      label: component.label,
      role: component.role,
      description: component.description,
    })),
    relationships: context.relationships ?? [],
    flows: context.candidateFlows.map((flow) => ({
      id: flow.id,
      nodeLabels: flow.nodeLabels,
      nodeDescriptions: flow.nodeDescriptions,
      edgeLabels: flow.edgeLabels,
    })),
  };
}
export type ReadmeProsePayload = ReturnType<typeof toPayload>;

export type ReadmeProseProvider = (
  payload: ReadmeProsePayload,
) => Promise<unknown>;

// Wraps a generic structured-output AIProvider (Ollama locally, Vercel AI
// Gateway in production — see provider.ts) with the README-prose-specific
// schema (bounded to the supplied flow ids) and prompt construction. Same
// split as generate-semantic-architecture.ts's semanticProviderFrom.
function readmeProviderFrom(request: AIProvider): ReadmeProseProvider {
  return async (payload) => {
    const modelSchema = readmeProseSchemaFor(
      payload.flows.map((flow) => flow.id),
    );
    const raw = await request({
      systemPrompt: readmeSystemPrompt,
      userPrompt: buildReadmePrompt(payload),
      schema: modelSchema,
    });
    return modelSchema.parse(raw);
  };
}

// Kept for direct construction (tests build this explicitly to inject a fake
// fetcher) — a full ReadmeProseProvider wired specifically to Ollama,
// unchanged in behavior from before the provider abstraction existed.
export function ollamaReadmeProvider(
  fetcher: typeof fetch = fetch,
): ReadmeProseProvider {
  return readmeProviderFrom(ollamaStructuredProvider(fetcher));
}

export async function generateReadmeProse(
  context: ReadmeContext,
  provider?: ReadmeProseProvider,
): Promise<ReadmeProse> {
  const resolvedProvider = provider ?? readmeProviderFrom(getAIProvider());
  const raw = await resolvedProvider(toPayload(context));
  return validateReadmeProse(raw, context);
}
