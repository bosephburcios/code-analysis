import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildArchitectureGraph } from '../src/lib/architecture/build-graph.ts';

test('CodeMap forms a Next.js -> API -> PostgreSQL chain', () => {
  const files = ['apps/web/next.config.ts', 'apps/web/src/app/api/repositories/import/route.ts', 'apps/web/src/prisma/schema.prisma'];
  const graph = buildArchitectureGraph(files, { [files[2]]: 'datasource db { provider = "postgresql" }' });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.ok(graph.nodes.some(n => n.label === 'Prisma / PostgreSQL'));
  assert.deepEqual(graph.edges.map(e => e.kind).sort(), ['data', 'sync']);
});
test('separates monorepo boundaries, stable IDs and no duplicate nodes', () => {
  const files = ['apps/a/next.config.mjs', 'apps/a/src/app/api/route.ts', 'apps/b/next.config.ts', 'apps/b/prisma/schema.prisma'];
  const graph = buildArchitectureGraph([...files, files[0]]);
  assert.deepEqual(graph, buildArchitectureGraph([...files].reverse()));
  const database = graph.nodes.find(n => n.type === 'database');
  for (const edge of graph.edges.filter(e => e.target === database.id)) assert.equal(graph.nodes.find(n => n.id === edge.source).path, 'apps/b');
  assert.equal(database.label, 'Prisma Database');
  assert.ok(graph.nodes.some(n => n.type === 'api' && n.path === 'apps/a'));
});
test('detects external SDKs, Python services and infra without connecting unrelated services', () => {
  const graph = buildArchitectureGraph(['apps/api/requirements.txt', 'apps/api/Dockerfile', 'apps/web/package.json'], {
    'apps/api/requirements.txt': 'fastapi\nboto3',
    'apps/web/package.json': '{"dependencies":{"next":"1","stripe":"1"}}',
  });
  assert.ok(graph.nodes.some(n => n.label === 'FastAPI Service'));
  assert.ok(graph.nodes.some(n => n.type === 'infra'));
  assert.ok(graph.nodes.some(n => n.label === 'AWS'));
  assert.ok(graph.nodes.some(n => n.label === 'Stripe'));
  assert.equal(graph.edges.length, 2);
});
test('ignores fixture apps and handles repositories with no recognized boundaries', () => {
  assert.deepEqual(buildArchitectureGraph(['examples/demo/next.config.ts', 'test/fixture/schema.prisma', 'README.md']), { nodes: [], edges: [] });
});

test('retains API responsibilities and UI entry points without leaking another app into evidence', () => {
  const files = ['apps/web/next.config.ts', 'apps/web/src/app/page.tsx',
    'apps/web/src/components/repository-import.tsx', 'apps/web/src/components/ui/button.tsx',
    'apps/web/src/app/api/auth/[...all]/route.ts', 'apps/web/src/app/api/repositories/import/route.ts',
    'apps/web/src/app/api/repositories/[id]/analysis/route.ts', 'apps/other/src/app/page.tsx'];
  const graph = buildArchitectureGraph(files);
  const api = graph.nodes.find(node => node.type === 'api');
  assert.equal(api.metadata.routeCount, 3);
  assert.equal(api.metadata.evidence.length, 3);
  assert.ok(api.metadata.evidence.includes('apps/web/src/app/api/repositories/import/route.ts'));
  const ui = graph.nodes.find(node => node.type === 'frontend');
  assert.deepEqual(ui.metadata.evidence, ['apps/web/next.config.ts', 'apps/web/src/app/page.tsx', 'apps/web/src/components/repository-import.tsx']);
});
