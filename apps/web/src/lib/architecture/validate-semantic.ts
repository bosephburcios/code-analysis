import { semanticArchitectureSchema } from './semantic-schema.ts';
import type { ArchitectureContext } from './build-ai-context.ts';
import { semanticRole } from './semantic-roles.ts';

export function validateSemanticArchitecture(input: unknown, evidence: ArchitectureContext) {
  const graph = semanticArchitectureSchema.parse(input);
  const components = new Map(evidence.components.map(node => [node.id, node]));
  const relationships = new Map(evidence.relationships.map(edge => [edge.id, edge]));
  const owners = new Map<string, string>();
  const ids = new Set<string>();
  const fail = (reason: string): never => { throw new Error(`Semantic evidence validation failed: ${reason}`); };
  for (const node of graph.nodes) {
    if (evidence.sourceLevel && node.type === 'feature') fail('frontend/backend responsibilities must remain separate');
    if (node.type !== semanticRole(node, evidence.components)) fail('component type contradicts source roles');
    if (ids.has(node.id)) fail('duplicate node ID');
    ids.add(node.id);
    const files = new Set<string>(); const technologies = new Set<string>();
    for (const id of node.sourceNodeIds) {
      const source = components.get(id);
      if (!source) fail('unknown source component');
      if (owners.has(id)) fail('source component assigned more than once');
      owners.set(id, node.id);
      const expected = source!.type === 'database' ? 'database' : source!.type === 'external' ? 'external' : null;
      if (expected && node.type !== expected) fail('database/external component merged with application');
      if ((node.type === 'database' || node.type === 'external') && source!.type !== node.type) fail('unrelated component in database/external group');
      for (const file of source!.files) files.add(file);
      for (const technology of source!.technologies) technologies.add(technology);
    }
    if (node.files.some(file => !files.has(file)) || node.technologies.some(technology => !technologies.has(technology))) fail('invented file or technology');
    // Persist the complete evidence trail, including anything the model omitted.
    node.files = [...files].sort(); node.technologies = [...technologies].sort();
  }
  if (owners.size !== components.size) fail('unrepresented source components');
  const edgeIds = new Set<string>(); const cited = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) fail('duplicate edge ID');
    edgeIds.add(edge.id);
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) fail('invalid edge endpoints');
    for (const id of edge.sourceEdgeIds) {
      const source = relationships.get(id);
      if (!source || owners.get(source.source) !== edge.source || owners.get(source.target) !== edge.target) fail('invented or reversed relationship');
      if (cited.has(id)) fail('relationship represented more than once');
      cited.add(id);
      if (source!.kind === 'data' ? edge.type !== 'data' : source!.kind === 'async' ? edge.type !== 'async' : !['request', 'dependency'].includes(edge.type)) fail('changed relationship kind');
    }
  }
  for (const edge of evidence.relationships) if (owners.get(edge.source) !== owners.get(edge.target) && !cited.has(edge.id)) fail('missing cross-group relationship');
  return graph;
}
