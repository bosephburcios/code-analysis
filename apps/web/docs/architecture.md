# Architecture extraction

The workspace at `/repos/[id]` shows a read-only React Flow system diagram, a compact Overview, and a component evidence index. Pan, zoom, and fit controls are enabled; editing and node actions are intentionally deferred.

The `ArchitectureGraph` model stores one graph per repository with a cascading relation. Ingestion builds the graph from the same filtered GitHub tree and manifest snapshot as the summary. A transaction writes the summary and graph only if the analysis lease still belongs to that request. Existing READY repositories without a graph are analyzed again on their next workspace visit.

Detectors in `src/lib/architecture` identify Next.js/React/Vue/Svelte boundaries, Next.js route groups, Express and Python services, Prisma databases, known external SDK dependencies, and Docker/Terraform/Vercel configuration. Tests and examples are excluded from system detection but remain in file/language counts. Node IDs are stable across file ordering and each node retains its evidence path.

Edges are deterministic structural inferences, not import tracing or runtime observations. Next.js apps connect to API routes at the same root. Databases and SDK dependencies attach to the closest enclosing detected app, preferring an API over a frontend at that root. Separate frontend and backend services are not connected without evidence. Infra nodes remain unconnected until deployment relationships can be detected. Database providers are named only when read from a Prisma schema; partial manifest coverage also limits graph detection.

Run from apps/web:

```sh
npx prisma migrate dev --name add_architecture_graph
npx prisma generate
node --experimental-strip-types --test tests/*.test.mjs
npx tsc --noEmit --incremental false
```
