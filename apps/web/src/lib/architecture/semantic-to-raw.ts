import type { ArchitectureGraph, ArchitectureNode } from './types.ts';
import type { SemanticArchitecture } from './semantic-schema.ts';

const typeMap: Record<SemanticArchitecture['nodes'][number]['type'], ArchitectureNode['type']> = {
  feature: 'service', frontend: 'frontend', backend: 'api', database: 'database',
  external: 'external', infrastructure: 'infra', pipeline: 'service',
};

// The canvas renders the coarse `ArchitectureGraph` shape (frontend/api/service/
// database/external/infra); the semantic graph is a richer, separate shape.
// This is the one conversion between them — used by the interactive
// architecture view and by the README's live preview/export rendering.
export function semanticToArchitectureGraph(semantic: SemanticArchitecture): ArchitectureGraph {
  return {
    nodes: semantic.nodes.map(node => ({
      id: node.id, label: node.label, type: typeMap[node.type],
      metadata: {
        technologies: node.technologies, description: node.description, evidence: node.files,
        semanticType: node.type, ...(node.role ? { role: node.role } : {}),
      },
    })),
    edges: semantic.edges.map(edge => ({
      id: edge.id, source: edge.source, target: edge.target, label: edge.label,
      kind: edge.type === 'data' ? 'data' : edge.type === 'async' ? 'async' : 'sync',
    })),
  };
}
