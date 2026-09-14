import { z } from 'zod';
import { architectureEvidence } from './types.ts';

const nodeSchema = z.object({ id: z.string(), type: z.enum(['frontend', 'api', 'service', 'database', 'external', 'infra']), label: z.string(), path: z.string().optional(), metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional() });
const edgeSchema = z.object({ id: z.string(), source: z.string(), target: z.string(), kind: z.enum(['sync', 'async', 'data']), label: z.string().optional(), evidence: z.array(z.string()).optional() });
const rawSchema = z.object({
  nodes: z.array(nodeSchema), edges: z.array(edgeSchema),
  responsibilities: z.object({ version: z.literal(1), nodes: z.array(nodeSchema), edges: z.array(edgeSchema), coverage: z.object({ scanned: z.number(), total: z.number(), complete: z.boolean(), reason: z.string().optional() }) }).optional(),
});
export function buildArchitectureContext(input: unknown) {
  const stored = rawSchema.parse(input);
  const raw = architectureEvidence(stored);
  const technologies = ['Next.js', 'React', 'Vue', 'Svelte', 'Express', 'FastAPI', 'Flask', 'Django', 'Prisma', 'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'SQL Server', 'CockroachDB', 'AWS', 'Supabase', 'Stripe', 'OpenAI API', 'Docker', 'Terraform', 'Vercel'];
  const components = raw.nodes.map(node => {
    const evidence = node.metadata?.evidence;
    const files = typeof evidence === 'string' ? [evidence] : Array.isArray(evidence) ? evidence : [];
    const detected = node.metadata?.technologies;
    return { id: node.id, label: node.label, path: node.path, type: node.type, files,
      technologies: Array.isArray(detected) ? detected : technologies.filter(technology => node.label.includes(technology)),
      responsibility: typeof node.metadata?.responsibility === 'string' ? node.metadata.responsibility : undefined,
      exports: node.metadata?.exports, operations: node.metadata?.operations, resources: node.metadata?.resources,
      basis: stored.responsibilities ? 'static source/configuration evidence; not verified runtime behavior' : 'file/configuration inference' };
  });
  const nodeIds = new Set(components.map(component => component.id));
  if (nodeIds.size !== components.length || new Set(raw.edges.map(edge => edge.id)).size !== raw.edges.length || raw.edges.some(edge => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) throw new Error('The raw graph contains invalid references. Reanalyze the repository.');
  const evidence = { components, relationships: raw.edges.map(edge => ({ ...edge, basis: 'structural inference; not a verified runtime call' })), sourceLevel: Boolean(stored.responsibilities) };
  if (components.length > 500 || JSON.stringify(evidence).length > 120_000) throw new Error('This graph exceeds the local semantic context limit. The dependency view remains available.');
  if (!components.length) throw new Error('No detected components are available to summarize.');
  return evidence;
}
export type ArchitectureContext = ReturnType<typeof buildArchitectureContext>;
