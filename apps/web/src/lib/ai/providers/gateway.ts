import {
  generateObject,
  LoadAPIKeyError,
  NoSuchModelError,
  NoObjectGeneratedError,
  APICallError,
} from "ai";
import type { AIProvider } from "../provider.ts";

// Production provider. Routes through Vercel AI Gateway via the AI SDK's
// structured-generation API (`generateObject`) — the model validates its own
// output against the same Zod schema Ollama is given, so the result needs no
// separate manual JSON parsing/repair step.
export function gatewayProvider(
  generate: typeof generateObject = generateObject,
): AIProvider {
  return async ({ systemPrompt, userPrompt, schema }) => {
    const model = process.env.AI_MODEL;
    if (!model)
      throw new Error(
        'Missing AI provider configuration. Set AI_MODEL (e.g. "anthropic/claude-sonnet-4-5") when AI_PROVIDER=gateway.',
      );
    if (!process.env.AI_GATEWAY_API_KEY)
      throw new Error(
        "Missing AI Gateway credentials. Set AI_GATEWAY_API_KEY when AI_PROVIDER=gateway.",
      );
    try {
      const { object } = await generate({
        model,
        schema,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0,
        abortSignal: AbortSignal.timeout(300_000),
      });
      return object;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new Error(
          "Hosted model generation timed out. Try a smaller graph.",
        );
      if (LoadAPIKeyError.isInstance(error))
        throw new Error(
          "Missing or invalid AI Gateway credentials. Set AI_GATEWAY_API_KEY.",
        );
      if (NoSuchModelError.isInstance(error))
        throw new Error(
          `Hosted model "${model}" was not found. Check AI_MODEL.`,
        );
      if (NoObjectGeneratedError.isInstance(error))
        throw new Error("Hosted model returned invalid structured output.");
      if (APICallError.isInstance(error))
        throw new Error(
          `Hosted model request failed${error.statusCode ? ` (${error.statusCode})` : ""}.`,
        );
      throw new Error("Cannot reach the hosted AI provider.");
    }
  };
}
