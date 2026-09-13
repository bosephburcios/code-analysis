# Repository ingestion

Opening `/repos/[id]` starts analysis for an imported repository. The workspace polls while another request is processing it, shows failures with a retry button, and reuses a saved READY result on later visits.

`POST /api/repositories/[id]/analysis` claims a database lease, fetches the default branch's recursive GitHub tree, filters dependency/build/generated paths, reads recognized manifests by immutable blob SHA, and saves the summary and tree SHA. Concurrent requests share the work. A lease older than two minutes can be retried after an interrupted request. `GET` returns current state.

Language percentages count retained files, not bytes or lines. All retained blobs contribute to the denominator; unrecognized extensions are Other. Symlinks and submodule references are excluded. Framework/tool detection is heuristic, using dependency names and configuration indicators; it does not execute repository code or prove that a service is deployed.

Configure DATABASE_URL in the web app environment. GITHUB_TOKEN is optional and server-only; authenticated GitHub API requests help avoid the unauthenticated rate limit. Restart the dev server after changing environment variables.

This milestone uses a bounded HTTP request, not a durable background worker. It allows 1 MB per manifest, five simultaneous blob requests, and a 90-second GitHub timeout. There is no manifest-count cutoff. Identical blob SHAs are fetched once, with root/workspace manifests prioritized over fixtures and examples. Truncated trees fail without saving incomplete totals. If manifest reads fail or time out, complete file/language counts are saved alongside explicitly labeled partial tool detection and manifest coverage. Deployment must allow the route's 120-second maximum duration. Larger repositories need queued processing/tree traversal in a later milestone.

Database setup: run `npx prisma migrate deploy` and `npx prisma generate` from apps/web. The repository_analysis migration only adds nullable columns.

Checks (from apps/web):

```sh
node --experimental-strip-types --test tests/repository-analysis.test.mjs
npx tsc --noEmit --incremental false
```
