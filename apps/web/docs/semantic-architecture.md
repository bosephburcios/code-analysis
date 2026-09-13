# Semantic architecture

Architecture is a local AI compression of the deterministic graph; Dependencies retains the full raw graph. Generation starts only when the user presses Generate architecture. The semantic endpoint requires the owning user’s session. Failure leaves the raw view and any prior valid result intact.

## Local setup

Ollama and qwen3:8b are used by default. Start the model server with `ollama serve`; download the model once with `ollama pull qwen3:8b`. The app server must be able to reach Ollama. A deployed web server's localhost is not your laptop.

Optional server environment variables:

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
```

Restart Next.js after changing these. The provider implementation lives in `src/lib/ai/generate-semantic-architecture.ts` and implements a small SemanticProvider interface; no hosted API key is needed. Generation has a 300-second timeout with a 360-second route budget; deployment must support this duration.

## Storage and evidence

The migration backfills `ArchitectureGraph.rawGraph` from the existing nodes/edges before removing those old columns. `semanticGraph` stores validated concepts and `generatedAt` records completion. New raw analysis invalidates a saved semantic graph. Generation uses an optimistic update against the original graph timestamp, so a result cannot overwrite newer analysis.

The compact context contains component IDs, labels, paths, evidence files, known technologies, and raw relationships. Source contents and secrets are not sent. Repeated roles with exactly the same detector type and label are bundled deterministically for this high-level view. All original app IDs and evidence paths remain separate in rawGraph and are expanded in semantic sourceNodeIds; a semantic bundle does not imply one deployed instance. Short model-facing component/edge aliases reduce output size and are expanded back to raw IDs before validation. Inputs larger than 500 components or 48,000 serialized characters are rejected rather than silently truncated.

Zod requires 1–15 nodes with confidence between 0 and 1. The server checks unique IDs, complete source coverage, one owner per raw component, valid edge direction/type, and exact file/technology membership. Every cross-group raw edge must survive compression; internal edges may disappear. Database and external components remain separate from application groups. Evidence paths are rebuilt from the raw graph before saving, preserving paths even when the model omits them.

The confidence score is model-assessed certainty about grouping/labeling, not calibrated reliability or proof of runtime behavior. The UI shows high (>=0.8), moderate (>=0.5), and low confidence, plus expandable evidence. Low confidence is retained visibly instead of silently dropping concepts and losing source coverage.

Current evidence is file/configuration based. It cannot support claims such as a specific GitHub call or `Repository.upsert()` without a future deterministic code analyzer. Free-text labels/descriptions remain model interpretations; validation guarantees source references and relationship provenance, not the truth of all prose. No model-discovered edge is accepted.

## Checks

From apps/web:

```
node --experimental-strip-types --test tests/*.test.mjs
npx tsc --noEmit --incremental false
```
