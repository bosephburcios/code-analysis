import { z } from "zod";

export const readmeProseSchema = z.strictObject({
  tagline: z.string().min(1).max(140),
  overview: z.string().min(1).max(800),
  architectureSummary: z.string().max(360).default(''),
  flows: z.array(
    z.strictObject({
      id: z.string().min(1).max(50),
      title: z.string().min(1).max(60),
      description: z.string().min(1).max(240),
    }),
  ),
});
export type ReadmeProse = z.infer<typeof readmeProseSchema>;

// Builds a per-request schema constraining structured output to exactly
// `flowIds.length` flow entries, each id drawn only from the supplied set —
// mirrors semantic-schema.ts's groupedArchitectureSchemaFor pattern of
// building a bounded, per-repo Zod schema so the model can't invent a flow.
// (A z.tuple() per-position encoding was tried first but Ollama's JSON
// Schema -> grammar converter rejects a tuple's "items": false with a 400;
// a length-constrained array + id enum is the same guarantee Ollama actually
// supports. Exact order/completeness is still enforced by validateReadmeProse.)
export function readmeProseSchemaFor(flowIds: string[]) {
  const idSchema = flowIds.length
    ? z.enum(flowIds as [string, ...string[]])
    : z.string();
  return z.strictObject({
    tagline: z.string().min(1).max(140),
    overview: z.string().min(1).max(800),
    architectureSummary: z.string().max(360).default(''),
    flows: z
      .array(
        z.strictObject({
          id: idSchema,
          title: z.string().min(1).max(60),
          description: z.string().min(1).max(240),
        }),
      )
      .min(flowIds.length)
      .max(flowIds.length),
  });
}
