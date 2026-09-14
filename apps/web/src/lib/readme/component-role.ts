import type { SemanticNode } from '../architecture/semantic-schema.ts';

// Older saved graphs predate the fine-grained role field.
export function readmeRole(node: SemanticNode) {
  if (node.role) return node.role;
  if (node.type === 'frontend') return 'ui';
  if (node.type === 'database' || node.type === 'external' || node.type === 'infrastructure') return node.type;
  if (node.files?.some(path => /\/api\/.*\/route\.[jt]s$/.test(path))) return 'api';
  if (/(?:analy[sz]|generat|extract|process|ingest|build.graph)/i.test(node.label)) return 'processor';
  return 'service';
}
