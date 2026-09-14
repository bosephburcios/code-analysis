import { architectureEvidence, type ArchitectureGraph, type ArchitectureNode } from './types.ts';
import type { SemanticNode } from './semantic-schema.ts';
import type { EvidenceContext, EvidenceKind } from './evidence-types.ts';

export function componentEvidencePlan(graph: ArchitectureGraph, component: SemanticNode) {
  const raw = architectureEvidence(graph);
  const ids = new Set(component.sourceNodeIds);
  const owned = raw.nodes.filter(node => ids.has(node.id));
  const identity = owned.map(node => node.label).join(' ');
  const external = owned.length > 0 && owned.every(node => node.type === 'external');
  const kind: EvidenceKind = owned.some(node => node.type === 'database') ? 'database'
    : external ? /Ollama|OpenAI|Anthropic|LLM/i.test(identity) ? 'ai_service' : 'external_api'
    : owned.some(node => node.type === 'api') ? 'api_route'
    : component.type === 'feature' || component.type === 'pipeline' || owned.length > 1 ? 'feature'
    : owned.some(node => node.type === 'frontend') ? 'ui_component' : 'dependency';
  const hosts = /GitHub API/i.test(identity) ? ['api.github.com'] : /Ollama/i.test(identity) ? ['localhost', '127.0.0.1'] : /OpenAI/i.test(identity) ? ['api.openai.com'] : /Anthropic/i.test(identity) ? ['api.anthropic.com'] : [];
  const packages = /Stripe/i.test(identity) ? ['stripe'] : /OpenAI/i.test(identity) ? ['openai'] : /Anthropic/i.test(identity) ? ['@anthropic-ai/sdk'] : /AWS/i.test(identity) ? ['@aws-sdk/', 'aws-sdk'] : /Supabase/i.test(identity) ? ['@supabase/supabase-js'] : /Ollama/i.test(identity) ? ['ollama'] : [];
  const models = owned.flatMap(node => Array.isArray(node.metadata?.resources) ? node.metadata.resources.filter(name => !name.includes('.')) : []);
  const targets = new Set(ids);
  // A physical store is reached through its Prisma client; follow data edges only.
  if (kind === 'database') for (let depth = 0; depth < 3; depth++) {
    for (const edge of raw.edges) if (edge.kind === 'data' && targets.has(edge.target)) targets.add(edge.source);
  }
  const edges = raw.edges.filter(edge => kind === 'database'
    ? edge.kind === 'data' && targets.has(edge.target) && targets.has(edge.source)
    : external ? ids.has(edge.target) : ids.has(edge.source));
  const files = new Map<string, EvidenceContext & { priority: number }>();
  const add = (path: string, definesComponent: boolean, priority: number) => {
    if (!files.has(path)) files.set(path, { kind, definesComponent, priority, lines: [], names: [], hosts, packages, models });
    const item = files.get(path)!;
    item.definesComponent ||= definesComponent;
    item.priority = Math.max(item.priority, priority);
    return item;
  };
  const paths = (node: ArchitectureNode) => [...new Set([
    ...(node.path ? [node.path] : []),
    ...(typeof node.metadata?.evidence === 'string' ? [node.metadata.evidence] : Array.isArray(node.metadata?.evidence) ? node.metadata.evidence : []),
  ])];
  for (const node of owned) for (const path of paths(node)) add(path, !external, /\.prisma$/.test(path) ? 12 : 5);
  for (const edge of edges) {
    const source = raw.nodes.find(node => node.id === edge.source);
    for (const reference of edge.evidence ?? []) {
      const match = /^(.*):(\d+)$/.exec(reference);
      const item = add(match?.[1] ?? reference, ids.has(edge.source) && !external, 10);
      if (match) item.lines.push(Number(match[2]));
      item.names.push(...(edge.names ?? []));
    }
    if (source?.path) add(source.path, ids.has(source.id) && !external, 7).names.push(...(edge.names ?? []));
  }
  return { kind, files: [...files].sort(([a, left], [b, right]) => right.priority - left.priority || a.localeCompare(b)) };
}
