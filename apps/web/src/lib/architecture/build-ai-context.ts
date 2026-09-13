import { z } from 'zod';
import type { ArchitectureGraph } from './types.ts';

const rawSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), type: z.enum(['frontend', 'api', 'service', 'database', 'external', 'infra']), label: z.string(), path: z.string().optional(), metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional() })),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), kind: z.enum(['sync', 'async', 'data']), label: z.string().optional() })),
});
export function buildArchitectureContext(input: unknown) {
  const raw: ArchitectureGraph = rawSchema.parse(input);
  const technologies = ['Next.js', 'React', 'Vue', 'Svelte', 'Express', 'FastAPI', 'Flask', 'Django', 'Prisma', 'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'SQL Server', 'CockroachDB', 'AWS', 'Supabase', 'Stripe', 'OpenAI API', 'Docker', 'Terraform', 'Vercel'];
  const components = raw.nodes.map(node => {
    const evidence = node.metadata?.evidence;
    const files = typeof evidence === 'string' ? [evidence] : Array.isArray(evidence) ? evidence : [];
    return { id: node.id, label: node.label, path: node.path, type: node.type, files,
      technologies: technologies.filter(technology => node.label.includes(technology)),
      basis: 'file/configuration inference' };
  });
  const nodeIds = new Set(components.map(component => component.id));
  if (nodeIds.size !== components.length || new Set(raw.edges.map(edge => edge.id)).size !== raw.edges.length || raw.edges.some(edge => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) throw new Error('The raw graph contains invalid references. Reanalyze the repository.');
  const evidence = { components, relationships: raw.edges.map(edge => ({ ...edge, basis: 'structural inference; not a verified runtime call' })) };
  // Never silently truncate evidence or submit an unbounded repository to the model.
  if (components.length > 500 || JSON.stringify(evidence).length > 48_000) throw new Error('This graph exceeds the local semantic context limit. The dependency view remains available.');
  if (!components.length) throw new Error('No detected components are available to summarize.');
  return evidence;
}
export type ArchitectureContext = ReturnType<typeof buildArchitectureContext>;
