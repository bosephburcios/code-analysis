import { readmeProseSchema, type ReadmeProse } from "./readme-prose-schema.ts";
import type { ReadmeContext } from "./build-context.ts";

export function validateReadmeProse(
  input: unknown,
  context: ReadmeContext,
): ReadmeProse {
  const prose = readmeProseSchema.parse(input);
  const expectedIds = context.candidateFlows.map((flow) => flow.id);
  const actualIds = prose.flows.map((flow) => flow.id);
  const matches =
    expectedIds.length === actualIds.length &&
    expectedIds.every((id, index) => id === actualIds[index]);
  if (!matches) {
    throw new Error(
      `Readme prose validation failed: flow ids do not match the supplied flows (expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(actualIds)}).`,
    );
  }
  return prose;
}
