import { z } from 'zod';

const id = z.string().min(1).max(300);
// Finer-grained than `type` (which stays the coarse layout category) — lets
// e.g. an API route handler and the internal processor it calls both be
// `backend`-typed while still reading as distinct. Optional on storage so
// graphs generated before this field existed keep parsing unchanged.
export const semanticRole = z.enum(['ui', 'api', 'service', 'processor', 'data_access', 'database', 'external', 'infrastructure']);
export const semanticArchitectureSchema = z.strictObject({
  nodes: z.array(z.strictObject({
    id, label: z.string().min(1).max(100),
    type: z.enum(['feature', 'frontend', 'backend', 'database', 'external', 'infrastructure', 'pipeline']),
    role: semanticRole.optional(),
    description: z.string().min(1).max(600),
    rationale: z.string().min(1).max(280).optional(),
    confidence: z.number().min(0).max(1),
    sourceNodeIds: z.array(id).min(1),
    files: z.array(z.string().min(1).max(1000)),
    technologies: z.array(z.string().min(1).max(100)),
  })).min(1).max(20),
  edges: z.array(z.strictObject({
    id, source: id, target: id, label: z.string().min(1).max(120),
    type: z.enum(['request', 'data', 'async', 'dependency']),
    sourceEdgeIds: z.array(id).min(1),
  })).max(500),
});
export type SemanticArchitecture = z.infer<typeof semanticArchitectureSchema>;
export type SemanticNode = SemanticArchitecture['nodes'][number];

// The model groups responsibilities explicitly. Storage retains the normalized
// node/edge shape so existing saved graphs and clients remain compatible.
export const groupBudgets = { frontend: 6, backend: 8, database: 2, external: 3, infrastructure: 1 } as const;
export function groupedArchitectureSchemaFor(sourceIds: [string, ...string[]], sourceTypes?: Record<string, string>, fixedAssignments?: Record<string, string>) {
  const categoryFor = (type: string) => type === 'api' || type === 'service' ? 'backend' : type === 'infra' ? 'infrastructure' : type;
  const slots = Object.entries(groupBudgets).flatMap(([category, budget]) => {
    const count = sourceTypes ? sourceIds.filter(id => categoryFor(sourceTypes[id]) === category).length : budget;
    return Array.from({ length: Math.min(budget, count) }, (_, index) => ({ category, id: `${category}-${index}` }));
  });
  const descriptor = z.strictObject({
    label: z.string().min(1).max(100),
    responsibility: z.string().min(1).max(600),
    role: semanticRole,
    rationale: z.string().min(1).max(280),
    confidence: z.number().min(0).max(1),
  });
  // A required property per source guarantees complete, exactly-once ownership.
  // Slot enums guarantee valid references and preserve architectural layers.
  return z.strictObject({
    assignments: z.strictObject(Object.fromEntries(sourceIds.map(id => {
      const choices = fixedAssignments?.[id] ? [fixedAssignments[id]] : slots.filter(slot => !sourceTypes || slot.category === categoryFor(sourceTypes[id])).map(slot => slot.id);
      return [id, z.enum(choices as [string, ...string[]])];
    }))),
    groups: z.strictObject(Object.fromEntries(Object.keys(groupBudgets).filter(category => slots.some(slot => slot.category === category)).map(category => [category,
      z.strictObject({ components: z.strictObject(Object.fromEntries(slots.filter(slot => slot.category === category).map(slot => [slot.id, descriptor]))) }),
    ]))),
  });
}
