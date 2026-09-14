import type { z } from "zod";
import { ollamaProvider } from "./providers/ollama.ts";
import { gatewayProvider } from "./providers/gateway.ts";

// A provider's only job is turning a system/user prompt pair plus a Zod
// schema into raw structured JSON — it knows nothing about semantic
// architecture, README prose, or any other caller-specific concept. Callers
// remain responsible for building the prompt/schema and for validating
// (and trusting) the result, exactly as before this abstraction existed.
export type AIProviderRequest = {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodTypeAny;
};
export type AIProvider = (request: AIProviderRequest) => Promise<unknown>;

// Selects the provider from AI_PROVIDER — "ollama" locally, "gateway" (Vercel
// AI Gateway via the AI SDK) in production. Never falls back silently: an
// unset or unrecognized value is a configuration error, not a guess.
export function getAIProvider(): AIProvider {
  const name = process.env.AI_PROVIDER;
  if (!name)
    throw new Error(
      'Missing AI provider configuration. Set AI_PROVIDER to "ollama" or "gateway".',
    );
  switch (name) {
    case "ollama":
      return ollamaProvider();
    case "gateway":
      return gatewayProvider();
    default:
      throw new Error(
        `Unsupported AI_PROVIDER "${name}". Expected "ollama" or "gateway".`,
      );
  }
}
