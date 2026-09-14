import { z } from 'zod';
import { groupedArchitectureSchemaFor, semanticArchitectureSchema, type SemanticArchitecture } from '../architecture/semantic-schema.ts';
import { buildSemanticPrompt, semanticSystemPrompt } from '../architecture/semantic-prompt.ts';
import { validateSemanticArchitecture } from '../architecture/validate-semantic.ts';
import { reconcileSemanticEdges } from '../architecture/reconcile-semantic-edges.ts';
import { responsibilitySlots } from '../architecture/responsibility-slots.ts';
import { reconcileSemanticRoles } from '../architecture/semantic-roles.ts';
import type { ArchitectureContext } from '../architecture/build-ai-context.ts';

export type SemanticProvider = (evidence: ArchitectureContext) => Promise<unknown>;
export function ollamaProvider(fetcher: typeof fetch = fetch): SemanticProvider {
  return async evidence => {
    // Keep each source module separate until the model groups responsibilities.
    const nodeRefs = new Map(evidence.components.map((node, index) => [`c${index}`, node.id]));
    const aliases = new Map([...nodeRefs].map(([alias, id]) => [id, alias]));
    const slots = evidence.sourceLevel ? responsibilitySlots(evidence) : null;
    const fixedAssignments = slots ? Object.fromEntries(Object.entries(slots.assignments).map(([id, slot]) => [aliases.get(id)!, slot])) : undefined;
    const modelSchema = groupedArchitectureSchemaFor([...nodeRefs.keys()] as [string, ...string[]], evidence.sourceLevel ? Object.fromEntries(evidence.components.map((node, index) => [`c${index}`, node.type])) : undefined, fixedAssignments);
    const compact = {
      responsibilityGroups: slots?.hints.map(slot => ({ ...slot, primarySource: aliases.get(slot.primarySource), sourceNodeIds: slot.sourceNodeIds.map(id => aliases.get(id)) })),
      components: evidence.components.map((node, index) => ({ ...node, id: `c${index}` })),
      relationships: evidence.relationships.map((edge, index) => ({ id: `r${index}`, source: aliases.get(edge.source), target: aliases.get(edge.target), kind: edge.kind, label: edge.label })),
    };
    let response: Response;
    try {
      response = await fetcher(`${(process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(300_000),
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? 'qwen3:8b', stream: false, think: false,
          format: z.toJSONSchema(modelSchema), options: { temperature: 0, num_ctx: 32768, num_predict: 4096 },
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
    const grouped = modelSchema.parse(parsed);
    const nodes = Object.entries(grouped.groups).flatMap(([category, group]) => Object.entries(group.components).flatMap(([slot, component]) => {
      const sourceNodeIds = Object.entries(grouped.assignments).filter(([, owner]) => owner === slot).map(([id]) => nodeRefs.get(id)!);
      // Unused bounded slots never become invented diagram components.
      return sourceNodeIds.length ? [{
        id: slot, label: component.label, type: category, role: component.role,
        description: component.responsibility, rationale: component.rationale,
        confidence: component.confidence,
        sourceNodeIds, files: [], technologies: [],
      }] : [];
    }));
    // Project original connections through ownership. The model cannot invent,
    // omit, reverse, or relabel a flow; internal helper connections collapse.
    const owners = new Map(nodes.flatMap(node => node.sourceNodeIds.map(id => [id, node.id] as const)));
    const edges: SemanticArchitecture['edges'] = [];
    const merged = new Map<string, SemanticArchitecture['edges'][number]>();
    for (const raw of evidence.relationships) {
      const source = owners.get(raw.source); const target = owners.get(raw.target);
      if (!source || !target || source === target) continue;
      const type = raw.kind === 'sync' ? 'dependency' : raw.kind;
      const label = raw.label ?? (type === 'data' ? 'Data access' : 'Dependency');
      const key = JSON.stringify([source, target, type, label]);
      const existing = merged.get(key);
      if (existing) existing.sourceEdgeIds.push(raw.id);
      else {
        const edge: SemanticArchitecture['edges'][number] = { id: `flow-${edges.length}`, source, target, type, label: label.slice(0, 120), sourceEdgeIds: [raw.id] };
        merged.set(key, edge); edges.push(edge);
      }
    }
    const graph = semanticArchitectureSchema.parse({ nodes, edges });
    return graph;
  };
}
export async function generateSemanticArchitecture(evidence: ArchitectureContext, provider: SemanticProvider = ollamaProvider()) {
  const graph = reconcileSemanticEdges(await provider(evidence), evidence);
  return validateSemanticArchitecture(reconcileSemanticRoles(graph, evidence.components), evidence);
}
