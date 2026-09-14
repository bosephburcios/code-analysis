import { z } from "zod";
import type { AIProvider } from "../provider.ts";

// Local development provider. Talks to a locally-running Ollama instance —
// never reachable from a Vercel deployment, which is exactly why AI_PROVIDER
// exists to swap this out for the gateway provider in production.
export function ollamaProvider(fetcher: typeof fetch = fetch): AIProvider {
  return async ({ systemPrompt, userPrompt, schema }) => {
    let response: Response;
    try {
      response = await fetcher(
        `${(process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "")}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(300_000),
          body: JSON.stringify({
            model: process.env.OLLAMA_MODEL ?? "qwen3:8b",
            stream: false,
            think: false,
            format: z.toJSONSchema(schema),
            options: { temperature: 0, num_ctx: 32768, num_predict: 4096 },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new Error(
          "Local model generation timed out. Try a smaller model or a smaller graph.",
        );
      throw new Error(
        "Cannot reach Ollama. Start Ollama on the server and install the configured model.",
      );
    }
    if (response.status === 404)
      throw new Error(
        "Ollama model not found. Run ollama pull qwen3:8b, or set OLLAMA_MODEL to an installed model.",
      );
    if (!response.ok)
      throw new Error(`Local model request failed (${response.status}).`);
    const result = await response.json();
    if (
      !result.done ||
      result.done_reason === "length" ||
      typeof result.message?.content !== "string"
    )
      throw new Error("Local model returned an incomplete response.");
    try {
      return JSON.parse(result.message.content);
    } catch {
      throw new Error("Local model returned invalid JSON.");
    }
  };
}
