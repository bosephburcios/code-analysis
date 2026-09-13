import { z } from 'zod';

const id = z.string().min(1).max(300);
export const semanticArchitectureSchema = z.strictObject({
  nodes: z.array(z.strictObject({
    id, label: z.string().min(1).max(100),
    type: z.enum(['feature', 'frontend', 'backend', 'database', 'external', 'infrastructure', 'pipeline']),
    description: z.string().min(1).max(600),
    confidence: z.number().min(0).max(1),
    sourceNodeIds: z.array(id).min(1),
    files: z.array(z.string().min(1).max(1000)),
    technologies: z.array(z.string().min(1).max(100)),
  })).min(1).max(15),
  edges: z.array(z.strictObject({
    id, source: id, target: id, label: z.string().min(1).max(120),
    type: z.enum(['request', 'data', 'async', 'dependency']),
    sourceEdgeIds: z.array(id).min(1),
  })).max(100),
});
export type SemanticArchitecture = z.infer<typeof semanticArchitectureSchema>;
export type SemanticNode = SemanticArchitecture['nodes'][number];
