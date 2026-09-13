export type ArchitectureNode = {
  id: string;
  type: 'frontend' | 'api' | 'service' | 'database' | 'external' | 'infra';
  label: string;
  path?: string;
  metadata?: Record<string, string | number | boolean | string[]>;
};
export type ArchitectureEdge = { id: string; source: string; target: string; label?: string; kind: 'sync' | 'async' | 'data' };
export type ArchitectureGraph = { nodes: ArchitectureNode[]; edges: ArchitectureEdge[] };
export type DetectionContext = { files: string[]; manifests: Record<string, string> };
export function node(type: ArchitectureNode['type'], label: string, path: string, evidence: string): ArchitectureNode {
  return { id: `${type}:${path}:${label}`, type, label, path, metadata: { evidence, inferred: true } };
}
export function dependencies(content: string): string[] {
  try {
    const json = JSON.parse(content);
    return Object.keys({ ...json?.dependencies, ...json?.devDependencies, ...json?.peerDependencies });
  } catch { return []; }
}
export function directory(path: string) { return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.'; }

export type StoredArchitecture = {
  rawGraph: ArchitectureGraph;
  semanticGraph: import('./semantic-schema.ts').SemanticArchitecture | null;
  generatedAt: string | null;
};
