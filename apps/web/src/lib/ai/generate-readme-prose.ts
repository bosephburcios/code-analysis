import { z } from 'zod';
import { readmeProseSchemaFor } from '../readme/readme-prose-schema.ts';
import { readmeSystemPrompt, buildReadmePrompt } from '../readme/readme-prompt.ts';
import { validateReadmeProse } from '../readme/validate-readme-prose.ts';
import type { ReadmeContext } from '../readme/build-context.ts';
import type { ReadmeProse } from '../readme/readme-prose-schema.ts';

function toPayload(context: ReadmeContext) {
  return {
    title: context.title,
    components: context.components.map(component => ({ label: component.label, role: component.role, description: component.description })),
    relationships: context.relationships ?? [],
    flows: context.candidateFlows.map(flow => ({ id: flow.id, nodeLabels: flow.nodeLabels, nodeDescriptions: flow.nodeDescriptions, edgeLabels: flow.edgeLabels })),
  };
}
export type ReadmeProsePayload = ReturnType<typeof toPayload>;

export type ReadmeProseProvider = (payload: ReadmeProsePayload) => Promise<unknown>;

// Mirrors generate-semantic-architecture.ts's ollamaProvider exactly — same
// endpoint/env vars, same structured-output-via-JSON-Schema approach, and
// the SAME error message strings, so the API route's error-classification
// regex extends by adding just one more alternative.
export function ollamaReadmeProvider(fetcher: typeof fetch = fetch): ReadmeProseProvider {
  return async payload => {
    const modelSchema = readmeProseSchemaFor(payload.flows.map(flow => flow.id));
    let response: Response;
    try {
      response = await fetcher(`${(process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(300_000),
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? 'qwen3:8b', stream: false, think: false,
          format: z.toJSONSchema(modelSchema), options: { temperature: 0, num_ctx: 32768, num_predict: 2048 },
          messages: [{ role: 'system', content: readmeSystemPrompt }, { role: 'user', content: buildReadmePrompt(payload) }],
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new Error('Local model generation timed out. Try a smaller model or a smaller graph.');
      throw new Error('Cannot reach Ollama. Start Ollama on the server and install the configured model.');
    }
    if (response.status === 404) throw new Error('Ollama model not found. Run ollama pull qwen3:8b, or set OLLAMA_MODEL to an installed model.');
    if (!response.ok) throw new Error(`Local model request failed (${response.status}).`);
    const result = await response.json();
    if (!result.done || result.done_reason === 'length' || typeof result.message?.content !== 'string') throw new Error('Local model returned an incomplete response.');
    let parsed: unknown;
    try { parsed = JSON.parse(result.message.content); } catch { throw new Error('Local model returned invalid JSON. No README prose was saved.'); }
    return modelSchema.parse(parsed);
  };
}

export async function generateReadmeProse(context: ReadmeContext, provider: ReadmeProseProvider = ollamaReadmeProvider()): Promise<ReadmeProse> {
  const raw = await provider(toPayload(context));
  return validateReadmeProse(raw, context);
}
