# Responsibility-level architecture

Architecture groups user-facing features, backend responsibilities, external systems, and persistent data. Dependencies retains the original framework/app boundary graph. Confidence, descriptions, technologies, schema resources, and expandable file/relationship evidence live in the Component index.

## Evidence pipeline

Ingestion reads a GitHub tree and retrieves source blobs by immutable SHA. It scans up to 100 eligible JavaScript/TypeScript files, at most 100 KB per file and 2 MB total, with concurrency five and the existing ingestion timeout. Generated code, tests, UI primitives, declarations, and environment files are excluded. The UI reports incomplete source coverage, including size, timeout, and GitHub rate-limit failures. Scanning coverage measures files read, not completeness of runtime dependency discovery.

The TypeScript parser inspects syntax without executing repository code. Evidence includes exported functions, imports, route handlers, static fetch URLs/methods, and Prisma delegate operations (including transaction callbacks). Relative imports and aliases in the nearest explicit tsconfig paths are resolved against known files. Unsupported/inherited alias configurations are left unresolved. URL credentials and query strings are not sent to the model; known GitHub and local Ollama endpoints become external components. Prisma schemas supply model names and JSON fields. A PostgreSQL provider alone does not prove Supabase hosting.

The deterministic responsibility graph is stored inside `rawGraph.responsibilities` with a version and source coverage. The original `rawGraph.nodes`/`edges` remain available for Dependencies. Existing JSON storage supports this without a database migration. Older snapshots show **Update source evidence** before responsibility generation; **Sync latest** also refreshes the source snapshot and invalidates older semantic output.

Server-rendered page loaders are backend modules, separate from frontend components. Browser-to-database flows are not invented to simplify a diagram. Unsupported languages retain detected service/configuration boundaries; Python and other languages do not yet receive function-level parsing. Dynamic imports, computed URLs, runtime injection, inherited TypeScript configurations, and wrappers beyond the supported syntax can leave connections unresolved.

## Grouped model contract

The server anchors responsibility slots on distinct UI tasks, HTTP entry points, integration callers, and persistence. Supporting modules attach through import proximity and shared responsibility terms. These are deterministic static heuristics, not verified business boundaries. Ollama receives these group hints, compact static facts, and short source IDs. It returns `assignments` (one required property per source ID) and `groups`, keyed by frontend, backend, database, external, and infrastructure. Each group contains bounded responsibility slots with a label, responsibility, and confidence. Slot references are enums fixed to the server’s source assignment. The model names and describes the responsibility groups without overriding their source ownership. Thus source IDs cannot be invented or omitted, and API sources cannot be assigned to frontend slots. The limits are 6 frontend, 8 backend, 2 database, 3 external, and 1 infrastructure component, capped by available sources; unused slots are discarded. The prompt targets 5–20 meaningful components and discourages framework-only names or merging an entire layer. SourceNodeIds are reconstructed from the assignments rather than trusted to an unconstrained citation array.

The Component index displays four components per page, with numbered navigation, ellipses for larger page sets, and previous/next controls. Pagination resets when the analysis or generated architecture changes.

The server projects extracted connections through the returned group ownership. The model does not author edges: direction, kind, action labels, and citations come from source evidence. Internal helper edges disappear when their owners are grouped; cross-group connections remain. Technology and file lists are reconstructed from source IDs. The result is normalized into the existing semantic nodes/edges storage contract for compatibility with saved graphs and React Flow. Frontend/backend classification is derived from source roles and mixed-layer ownership is rejected.

All supplied facts are marked as untrusted data in the system prompt. Group names, labels, and descriptions remain model interpretations; confidence is not calibrated proof of runtime behavior. Validation enforces unique IDs, ownership, complete source coverage, valid edge direction/kind, and evidence membership. No model-invented relationship is saved.

## Local setup and regeneration

### Component inspector

Selecting a component (click, Enter, or Space) opens a shadcn right-side reference panel with its responsibility, technologies, confidence, source components, backing files, and incoming/outgoing flows. Flow details retain raw file/line citations and link to the connected component. The desktop panel allows continued graph interaction; on mobile it becomes a full-width modal sheet. Escape and the close button dismiss it. Architecture uses slightly larger text and a tighter fit; edge labels appear individually on hover or click, while every flow remains listed in the inspector. Dependencies keeps its own view and inspector.

Code previews use an authenticated, repository-owner-scoped `GET /api/repositories/[id]/architecture/code?path=…`. The server only accepts paths cited by the stored raw architecture, reads the analyzed tree SHA and matching blob, and verifies the Git blob hash before returning source. Branch-head changes cannot change these excerpts. Environment files, secrets directories, symlinks, binary content, and files over 100 KB are rejected. Requests have a 20-second timeout and bounded response bodies. Incomplete GitHub trees and access/rate-limit failures produce a retryable preview message, leaving the graph usable.

Preview selection parses JavaScript/TypeScript syntax without executing code. It prioritizes HTTP handlers, supported API/database calls, and recorded connection lines; other files receive an explicitly labelled source preview. At most three excerpts of 60 lines are shown, with original line numbers, syntax coloring, highlighted evidence lines, and copy controls. Snippets are read on demand and are not model-authored or sent to the model. Existing analyzed graphs work without regeneration or a migration when they contain a snapshot SHA and cited files.

Ollama and `qwen3:8b` are used by default. Start with `ollama serve` and install once with `ollama pull qwen3:8b`. Optional server variables are `OLLAMA_BASE_URL` and `OLLAMA_MODEL`; restart Next.js after changing them. No hosted API key is required. A deployed server's localhost is not your laptop.

The context is bounded to 500 source components and 120,000 serialized characters. The provider requests a 32,768-token context and up to 7,000 output tokens with a 300-second timeout. Large local generations require sufficient memory and a deployment that supports the 360-second route budget.

**Regenerate architecture** replaces the saved semantic output only after successful validation. A failed regeneration leaves the previous result intact. Saving requires the owning user's session and the original raw graph timestamp, preventing overwrite of a newer analysis. Client updates also check the active source snapshot.

## Checks

From apps/web:

```sh
node --experimental-strip-types --test tests/*.test.mjs
npx tsc --noEmit
```
