import type { SemanticArchitecture, SemanticNode } from './semantic-schema.ts';
import type { ArchitectureNode } from './types.ts';

export function semanticRole(node: SemanticNode, sources: Pick<ArchitectureNode, 'id' | 'type'>[]): SemanticNode['type'] {
  const ids = new Set(node.sourceNodeIds);
  const roles = new Set(sources.filter(source => ids.has(source.id)).map(source => source.type));
  // Database/external mixing is rejected by evidence validation, never repaired.
  if (!roles.size || roles.has('database') || roles.has('external')) return node.type;
  if ([...roles].every(role => role === 'frontend')) return 'frontend';
  if ([...roles].every(role => role === 'api' || role === 'service')) return 'backend';
  if ([...roles].every(role => role === 'infra')) return 'infrastructure';
  return 'feature';
}

export function reconcileSemanticRoles(graph: SemanticArchitecture, sources: Pick<ArchitectureNode, 'id' | 'type'>[]): SemanticArchitecture {
  return { ...graph, nodes: graph.nodes.map(node => ({ ...node, type: semanticRole(node, sources) })) };
}

// Friendly display labels for the `role` field, with a `type`-based fallback
// for graphs generated before `role` existed.
export const ROLE_LABELS: Record<string, string> = {
  ui: "Frontend", api: "Backend API", service: "Service", processor: "Processor",
  data_access: "Data access", database: "Database", external: "External service", infrastructure: "Infrastructure",
};
export const TYPE_LABELS: Record<string, string> = {
  frontend: "Frontend", backend: "Backend", database: "Database", external: "External service",
  infrastructure: "Infrastructure", feature: "Feature", pipeline: "Service",
};
export function roleLabel(node: Pick<SemanticNode, 'role' | 'type'>) {
  return (node.role && ROLE_LABELS[node.role]) || TYPE_LABELS[node.type] || node.type;
}
