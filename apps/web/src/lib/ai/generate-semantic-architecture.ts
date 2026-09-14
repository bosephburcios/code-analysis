import {
  groupedArchitectureSchemaFor,
  semanticArchitectureSchema,
  type SemanticArchitecture,
} from "../architecture/semantic-schema.ts";
import {
  buildSemanticPrompt,
  semanticSystemPrompt,
} from "../architecture/semantic-prompt.ts";
import { validateSemanticArchitecture } from "../architecture/validate-semantic.ts";
import { reconcileSemanticEdges } from "../architecture/reconcile-semantic-edges.ts";
import { responsibilitySlots } from "../architecture/responsibility-slots.ts";
import { reconcileSemanticRoles } from "../architecture/semantic-roles.ts";
import type { ArchitectureContext } from "../architecture/build-ai-context.ts";
import { ollamaProvider as ollamaStructuredProvider } from "./providers/ollama.ts";
import { getAIProvider, type AIProvider } from "./provider.ts";

export type SemanticProvider = (
  evidence: ArchitectureContext,
) => Promise<unknown>;

// Deterministic analysis discovers repository facts (components, files,
// relationships); the model only groups, labels, summarizes, and explains
// them. This wraps a generic structured-output AIProvider with exactly that
// evidence compaction/aliasing and the grouped-assignment -> nodes/edges
// reconstruction — unchanged from before the provider abstraction existed,
// and identical regardless of which AIProvider (Ollama, Gateway) produced
// the grouped assignments.
function semanticProviderFrom(request: AIProvider): SemanticProvider {
  return async (evidence) => {
    // Keep each source module separate until the model groups responsibilities.
    const nodeRefs = new Map(
      evidence.components.map((node, index) => [`c${index}`, node.id]),
    );
    const aliases = new Map([...nodeRefs].map(([alias, id]) => [id, alias]));
    const slots = evidence.sourceLevel ? responsibilitySlots(evidence) : null;
    const fixedAssignments = slots
      ? Object.fromEntries(
          Object.entries(slots.assignments).map(([id, slot]) => [
            aliases.get(id)!,
            slot,
          ]),
        )
      : undefined;
    const modelSchema = groupedArchitectureSchemaFor(
      [...nodeRefs.keys()] as [string, ...string[]],
      evidence.sourceLevel
        ? Object.fromEntries(
            evidence.components.map((node, index) => [`c${index}`, node.type]),
          )
        : undefined,
      fixedAssignments,
    );
    const compact = {
      responsibilityGroups: slots?.hints.map((slot) => ({
        ...slot,
        primarySource: aliases.get(slot.primarySource),
        sourceNodeIds: slot.sourceNodeIds.map((id) => aliases.get(id)),
      })),
      components: evidence.components.map((node, index) => ({
        ...node,
        id: `c${index}`,
      })),
      relationships: evidence.relationships.map((edge, index) => ({
        id: `r${index}`,
        source: aliases.get(edge.source),
        target: aliases.get(edge.target),
        kind: edge.kind,
        label: edge.label,
      })),
    };
    const raw = await request({
      systemPrompt: semanticSystemPrompt,
      userPrompt: buildSemanticPrompt(compact),
      schema: modelSchema,
    });
    const grouped = modelSchema.parse(raw);
    const nodes = Object.entries(grouped.groups).flatMap(([category, group]) =>
      Object.entries(group.components).flatMap(([slot, component]) => {
        const sourceNodeIds = Object.entries(grouped.assignments)
          .filter(([, owner]) => owner === slot)
          .map(([id]) => nodeRefs.get(id)!);
        // Unused bounded slots never become invented diagram components.
        return sourceNodeIds.length
          ? [
              {
                id: slot,
                label: component.label,
                type: category,
                role: component.role,
                description: component.responsibility,
                rationale: component.rationale,
                confidence: component.confidence,
                sourceNodeIds,
                files: [],
                technologies: [],
              },
            ]
          : [];
      }),
    );
    // Project original connections through ownership. The model cannot invent,
    // omit, reverse, or relabel a flow; internal helper connections collapse.
    const owners = new Map(
      nodes.flatMap((node) =>
        node.sourceNodeIds.map((id) => [id, node.id] as const),
      ),
    );
    const edges: SemanticArchitecture["edges"] = [];
    const merged = new Map<string, SemanticArchitecture["edges"][number]>();
    for (const relationship of evidence.relationships) {
      const source = owners.get(relationship.source);
      const target = owners.get(relationship.target);
      if (!source || !target || source === target) continue;
      const type =
        relationship.kind === "sync" ? "dependency" : relationship.kind;
      const label =
        relationship.label ?? (type === "data" ? "Data access" : "Dependency");
      const key = JSON.stringify([source, target, type, label]);
      const existing = merged.get(key);
      if (existing) existing.sourceEdgeIds.push(relationship.id);
      else {
        const edge: SemanticArchitecture["edges"][number] = {
          id: `flow-${edges.length}`,
          source,
          target,
          type,
          label: label.slice(0, 120),
          sourceEdgeIds: [relationship.id],
        };
        merged.set(key, edge);
        edges.push(edge);
      }
    }
    return semanticArchitectureSchema.parse({ nodes, edges });
  };
}

// Kept for direct construction (tests build this explicitly to inject a fake
// fetcher) — a full SemanticProvider wired specifically to Ollama, unchanged
// in behavior from before the provider abstraction existed.
export function ollamaProvider(
  fetcher: typeof fetch = fetch,
): SemanticProvider {
  return semanticProviderFrom(ollamaStructuredProvider(fetcher));
}

export async function generateSemanticArchitecture(
  evidence: ArchitectureContext,
  provider?: SemanticProvider,
) {
  const resolvedProvider = provider ?? semanticProviderFrom(getAIProvider());
  const graph = reconcileSemanticEdges(
    await resolvedProvider(evidence),
    evidence,
  );
  return validateSemanticArchitecture(
    reconcileSemanticRoles(graph, evidence.components),
    evidence,
  );
}
