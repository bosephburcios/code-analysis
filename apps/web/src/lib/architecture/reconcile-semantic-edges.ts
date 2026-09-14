import { semanticArchitectureSchema, type SemanticArchitecture } from './semantic-schema.ts';
import type { ArchitectureContext } from './build-ai-context.ts';

// The model chooses groupings; the raw evidence determines relationship kinds.
// Keep all citations/endpoints intact for the strict evidence validator afterward.
export function reconcileSemanticEdges(input: unknown, evidence: ArchitectureContext) {
  const graph = semanticArchitectureSchema.parse(input);
  const relationships = new Map(evidence.relationships.map(edge => [edge.id, edge]));
  const usedIds = new Set(graph.edges.map(edge => edge.id));
  const labels = {
    data: 'Data access (inferred)',
    async: 'Async relationship (inferred)',
    dependency: 'Dependency (inferred)',
    request: 'Request (inferred)',
  };
  graph.edges = graph.edges.flatMap(edge => {
    const groups = new Map<SemanticArchitecture['edges'][number]['type'], string[]>();
    for (const id of edge.sourceEdgeIds) {
      const source = relationships.get(id);
      if (!source) throw new Error('Semantic evidence validation failed: unknown source relationship');
      const type = source.kind === 'sync'
        ? (edge.type === 'request' ? 'request' : 'dependency')
        : source.kind;
      groups.set(type, [...(groups.get(type) ?? []), id]);
    }
    return [...groups].map(([type, sourceEdgeIds], index) => {
      let id = edge.id;
      if (index > 0) {
        let suffix = 1;
        do { id = `${edge.id.slice(0, 270)}-${type}-${suffix++}`; } while (usedIds.has(id));
        usedIds.add(id);
      }
      return {
        ...edge, id, type, sourceEdgeIds,
        label: type === edge.type && groups.size === 1 ? edge.label : labels[type],
      };
    });
  });
  return graph;
}
