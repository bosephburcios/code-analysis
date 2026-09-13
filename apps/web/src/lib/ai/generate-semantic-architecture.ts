import { z } from 'zod';
import { semanticArchitectureSchema } from '../architecture/semantic-schema.ts';
import { buildSemanticPrompt, semanticSystemPrompt } from '../architecture/semantic-prompt.ts';
import { validateSemanticArchitecture } from '../architecture/validate-semantic.ts';
import type { ArchitectureContext } from '../architecture/build-ai-context.ts';

export type SemanticProvider = (evidence: ArchitectureContext) => Promise<unknown>;
export function ollamaProvider(fetcher: typeof fetch = fetch): SemanticProvider {
  return async evidence => {
    // Identical detected roles form one evidence bundle for semantic compression.
    // Original app IDs and files remain intact in rawGraph and are expanded below.
    const bundles = new Map<string, ArchitectureContext['components']>();
    for (const component of evidence.components) {
      const key = `${component.type}:${component.label}`;
      bundles.set(key, [...(bundles.get(key) ?? []), component]);
    }
    const groups = [...bundles.values()];
    const nodeRefs = new Map(groups.map((nodes, index) => [`c${index}`, nodes.map(node => node.id)]));
    const edgeRefs = new Map(evidence.relationships.map((edge, index) => [`r${index}`, edge.id]));
    const aliases = new Map([...nodeRefs].flatMap(([alias, ids]) => ids.map(id => [id, alias] as const)));
    const compact = {
      components: groups.map((nodes, index) => ({ id: `c${index}`, label: nodes[0].label, type: nodes[0].type,
        files: nodes.flatMap(node => node.files), technologies: [...new Set(nodes.flatMap(node => node.technologies))], sourceCount: nodes.length })),
      relationships: evidence.relationships.map((edge, index) => ({ id: `r${index}`, source: aliases.get(edge.source), target: aliases.get(edge.target), kind: edge.kind, label: edge.label })),
    };
    let response: Response;
    try {
      response = await fetcher(`${(process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(300_000),
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? 'qwen3:8b', stream: false, think: false,
          format: z.toJSONSchema(semanticArchitectureSchema), options: { temperature: 0, num_ctx: 16384, num_predict: 5000 },
          messages: [{ role: 'system', content: semanticSystemPrompt }, { role: 'user', content: buildSemanticPrompt(compact) }],
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
    try { parsed = JSON.parse(result.message.content); } catch { throw new Error('Local model returned invalid JSON. No semantic graph was saved.'); }
    const graph = semanticArchitectureSchema.parse(parsed);
    for (const node of graph.nodes) node.sourceNodeIds = node.sourceNodeIds.flatMap(id => nodeRefs.get(id) ?? [id]);
    for (const edge of graph.edges) edge.sourceEdgeIds = edge.sourceEdgeIds.map(id => edgeRefs.get(id) ?? id);
    return graph;
  };
}
export async function generateSemanticArchitecture(evidence: ArchitectureContext, provider: SemanticProvider = ollamaProvider()) {
  return validateSemanticArchitecture(await provider(evidence), evidence);
}
