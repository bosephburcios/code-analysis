import { groupedResponse } from './helpers/grouped-response.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSourceFacts } from '../src/lib/architecture/source-facts.ts';
import { buildResponsibilityGraph, isArchitectureSource } from '../src/lib/architecture/build-responsibilities.ts';
import { buildArchitectureGraph } from '../src/lib/architecture/build-graph.ts';
import { buildArchitectureContext } from '../src/lib/architecture/build-ai-context.ts';
import { generateSemanticArchitecture, ollamaProvider } from '../src/lib/ai/generate-semantic-architecture.ts';
import { ingestRepository } from '../src/lib/repository-analysis.ts';

const files = {
  'apps/web/src/components/repository-import.tsx': `'use client'; export function RepositoryImport() { return fetch('/api/repositories/import', { method: 'POST' }); }`,
  'apps/web/src/components/repository-workspace.tsx': `'use client'; import { ArchitectureCanvas } from './architecture-canvas'; export function RepositoryWorkspace() { return <ArchitectureCanvas />; }`,
  'apps/web/src/components/architecture-canvas.tsx': `import { ReactFlow } from '@xyflow/react'; export function ArchitectureCanvas() { return <ReactFlow />; }`,
  'apps/web/src/app/api/repositories/import/route.ts': `import { prisma } from '@/lib/prisma'; export async function POST() { await fetch('https://api.github.com/repos/owner/repo'); return prisma.repository.upsert({}); }`,
  'apps/web/src/app/api/repositories/[id]/analysis/route.ts': `import { analyzeRepository } from '@/lib/repository-analysis'; export function POST() { return analyzeRepository(); }`,
  'apps/web/src/lib/repository-analysis.ts': `const base = 'https://api.github.com/repos/a/b'; async function get(path) { return fetch(base + path); } export async function analyzeRepository() { return get('/git/trees/main'); }`,
  'apps/web/src/lib/ai/generate.ts': `export async function generateArchitecture() { return fetch('http://localhost:11434/api/chat', { method: 'POST' }); }`,
  'apps/web/src/lib/prisma.ts': `import { PrismaClient } from '@/generated/prisma/client'; export const prisma = new PrismaClient({});`,
  'apps/web/src/app/repos/page.tsx': `import { prisma } from '@/lib/prisma'; export default async function Page() { return prisma.repository.findMany(); }`,
};
const manifests = { 'apps/web/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }), 'apps/web/src/prisma/schema.prisma': 'datasource db { provider = "postgresql" }\nmodel Repository {\n id String @id\n}\nmodel ArchitectureGraph {\n id String @id\n}' };
const paths = [...Object.keys(files), ...Object.keys(manifests), 'apps/web/next.config.ts'];
function snapshot() {
  const raw = buildArchitectureGraph(paths, manifests);
  return { ...raw, responsibilities: buildResponsibilityGraph(paths, files, manifests, raw, { scanned: 9, total: 9, complete: true }) };
}

test('extracts responsibility modules and concrete flows instead of three technology nodes', () => {
  const graph = snapshot();
  assert.equal(graph.nodes.length, 3);
  const { nodes, edges } = graph.responsibilities;
  assert.equal(nodes.length, 12);
  const frontend = nodes.find(node => node.path?.endsWith('repository-import.tsx'));
  const api = nodes.find(node => node.path?.endsWith('import/route.ts'));
  assert.equal(frontend.type, 'frontend');
  assert.equal(api.type, 'api');
  assert.ok(edges.some(edge => edge.source === frontend.id && edge.target === api.id && edge.label === 'POST /api/repositories/import'));
  assert.ok(edges.some(edge => edge.source === api.id && edge.label === 'save repository' && edge.evidence[0].includes(':1')));
  assert.ok(edges.some(edge => edge.label === 'fetch repository tree'));
  assert.ok(edges.some(edge => edge.label === 'send evidence for grouping'));
  assert.ok(nodes.some(node => node.label === 'GitHub API'));
  assert.ok(nodes.some(node => node.label === 'Local LLM / Ollama'));
  assert.equal(nodes.find(node => node.path?.endsWith('/repos/page.tsx')).type, 'service');
  assert.ok(!edges.some(edge => edge.source === frontend.id && edge.kind === 'data'));
  const data = nodes.find(node => node.type === 'database');
  assert.deepEqual(data.metadata.resources, ['Repository', 'ArchitectureGraph']);
  assert.equal(buildArchitectureContext(graph).components.length, nodes.length);
});

test('source scan ignores secrets, generated files, UI primitives, and test fixtures', () => {
  for (const path of ['.env', 'apps/web/.env.local', 'src/generated/prisma/client.ts', 'src/components/ui/button.tsx', 'src/lib/foo.test.ts', 'tests/fixture.ts', 'src/types.d.ts']) assert.equal(isArchitectureSource(path), false, path);
  assert.equal(isArchitectureSource('apps/web/src/lib/analyzer.ts'), true);
});

test('AST scan ignores fake calls in comments/strings and never evaluates code', () => {
  const facts = extractSourceFacts('src/lib/a.ts', `
    // fetch('https://api.github.com/repos/fake')
    const example = "prisma.repository.upsert({})";
    const other = "fetch('http://localhost:11434/api/chat')";
    export function fn() { throw new Error('must never execute'); }
  `);
  assert.deepEqual(facts.requests, []);
  assert.deepEqual(facts.database, []);
});

test('does not invent cross-app connections or connect frontend directly to persistence', () => {
  const extra = { ...files, 'apps/other/src/components/import.tsx': `'use client'; fetch('/api/repositories/import', { method: 'POST' });` };
  const raw = buildArchitectureGraph([...paths, ...Object.keys(extra)], manifests);
  const graph = buildResponsibilityGraph([...paths, ...Object.keys(extra)], extra, manifests, raw, { scanned: 10, total: 10, complete: true });
  assert.ok(!graph.edges.some(edge => edge.source === 'source:apps/other/src/components/import.tsx'));
});

test('grouped model output preserves separate responsibilities, resources, and proven flows', async () => {
  const context = buildArchitectureContext(snapshot());
  const result = await generateSemanticArchitecture(context, ollamaProvider(async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.ok(body.format.properties.groups);
    assert.equal(body.format.properties.edges, undefined);
    const evidence = JSON.parse(body.messages[1].content.split('\n').slice(1).join('\n'));
    assert.equal(evidence.components.length, 12);
    const nodes = evidence.components.map(source => ({
      label: source.label, type: ['api', 'service'].includes(source.type) ? 'backend' : source.type,
      description: source.responsibility ?? 'Detected source responsibility.', confidence: 0.8, sourceNodeIds: [source.id],
    }));
    return Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(groupedResponse({ nodes }, body.format)) } });
  }));
  assert.equal(result.nodes.length, 12);
  assert.ok(result.edges.some(edge => edge.label === 'fetch repository tree'));
  assert.ok(result.edges.some(edge => edge.label === 'save repository'));
  assert.ok(result.nodes.find(node => node.sourceNodeIds.includes('source:apps/web/src/components/architecture-canvas.tsx')).technologies.includes('React Flow'));
});

test('ingestion fetches source by immutable SHA and visibly retains a partial source scan', async () => {
  const tree = [
    { path: 'src/components/import.tsx', sha: 'ui-sha', type: 'blob' },
    { path: 'src/lib/analyzer.ts', sha: 'backend-sha', type: 'blob' },
    { path: '.env', sha: 'secret-sha', type: 'blob' },
  ];
  const urls = [];
  const result = await ingestRepository('a', 'b', 'main', async url => {
    urls.push(String(url));
    if (String(url).includes('/trees/')) return Response.json({ sha: 'snapshot', tree, truncated: false });
    if (String(url).endsWith('backend-sha')) return new Response('', { status: 429 });
    return Response.json({ encoding: 'base64', size: 50, content: Buffer.from(`'use client'; export function Import() {}`).toString('base64') });
  });
  assert.ok(urls.some(url => url.endsWith('/git/blobs/ui-sha')));
  assert.ok(!urls.some(url => url.includes('secret-sha')));
  assert.equal(result.architecture.responsibilities.coverage.complete, false);
  assert.equal(result.architecture.responsibilities.coverage.scanned, 1);
  assert.equal(result.architecture.responsibilities.coverage.total, 2);
});

test('Prisma transaction callbacks retain model operations and imported-client provenance', () => {
  const facts = extractSourceFacts('src/lib/save.ts', `import { prisma } from '@/lib/prisma';
    export async function save() { return prisma.$transaction(async tx => {
      await tx.repository.updateMany({});
      await tx.architectureGraph.upsert({});
    }); }
    function unrelated(tx) { tx.repository.deleteMany({}); }
  `);
  assert.deepEqual(facts.database.map(({client, model, operation}) => ({client, model, operation})), [
    {client: 'prisma', model: 'repository', operation: 'updateMany'},
    {client: 'prisma', model: 'architectureGraph', operation: 'upsert'},
  ]);
});

test('custom aliases require config evidence; conventional @ aliases are not guessed', () => {
  const raw = buildArchitectureGraph(paths, manifests);
  const withoutConfig = { ...manifests };
  delete withoutConfig['apps/web/tsconfig.json'];
  const graph = buildResponsibilityGraph(paths, files, withoutConfig, raw, {scanned: 9, total: 9, complete: true});
  assert.ok(!graph.edges.some(edge => edge.source.endsWith('import/route.ts') && edge.target.endsWith('lib/prisma.ts')));
  const custom = { ...files, 'apps/web/src/lib/caller.ts': `import { prisma } from '~server/prisma'; export function load() { return prisma.repository.findMany(); }` };
  const configured = { ...manifests, 'apps/web/tsconfig.json': '{ /* comment */ "compilerOptions": { "paths": { "~server/*": ["./src/lib/*"] } } }' };
  const resolved = buildResponsibilityGraph([...paths, 'apps/web/src/lib/caller.ts'], custom, configured, raw, {scanned: 10,total:10,complete:true});
  assert.ok(resolved.edges.some(edge => edge.source.endsWith('caller.ts') && edge.target.endsWith('prisma.ts') && edge.label === 'read repository'));
});

test('grouped contract requires every source exactly once and rejects unknown or wrong-layer slots', async () => {
  const context = buildArchitectureContext(snapshot());
  for (const mutate of [
    result => delete result.assignments.c0,
    result => result.assignments.fake = 'backend-0',
    result => result.assignments.c0 = 'invented-slot',
    result => result.assignments.c0 = 'frontend-0',
  ]) {
    const provider = ollamaProvider(async (_url, init) => {
      const body = JSON.parse(init.body);
      const components = JSON.parse(body.messages[1].content.split('\n').slice(1).join('\n')).components;
      const nodes = components.map(source => ({label: source.label, type: ['api', 'service'].includes(source.type) ? 'backend' : source.type,
        description: 'Detected source.', confidence: 0.8, sourceNodeIds: [source.id]}));
      const result = groupedResponse({nodes}, body.format);
      mutate(result);
      return Response.json({done:true, done_reason:'stop', message:{content:JSON.stringify(result)}});
    });
    await assert.rejects(generateSemanticArchitecture(context, provider));
  }
});

test('database evidence includes JSON resources but does not invent a hosting provider', () => {
  const schemas = { ...manifests, 'apps/web/src/prisma/schema.prisma': 'datasource db { provider = "postgresql" }\nmodel Repository {\n id String @id\n analysis Json?\n}' };
  const raw = buildArchitectureGraph(paths, schemas);
  const graph = buildResponsibilityGraph(paths, files, schemas, raw, {scanned:9,total:9,complete:true});
  const data = graph.nodes.find(node => node.type === 'database');
  assert.deepEqual(data.metadata.resources, ['Repository', 'Repository.analysis (JSON)']);
  assert.ok(!graph.nodes.some(node => /Supabase/.test(node.label)));
});

test('responsibility slots preserve distinct UI tasks while grouping viewer helpers', async () => {
  const { responsibilitySlots } = await import('../src/lib/architecture/responsibility-slots.ts');
  const sources = {
    ...files,
    'apps/web/src/components/repository-overview.tsx': `export function RepositoryOverview() { return <div />; }`,
    'apps/web/src/components/architecture/viewer.tsx': `'use client'; import { Controls } from './controls'; export function Viewer() { return <Controls />; }`,
    'apps/web/src/components/architecture/controls.tsx': `export function Controls() { return <button />; }`,
  };
  const allPaths = [...paths, ...Object.keys(sources)];
  const raw = buildArchitectureGraph(allPaths, manifests);
  raw.responsibilities = buildResponsibilityGraph(allPaths, sources, manifests, raw, {scanned:12,total:12,complete:true});
  const evidence = buildArchitectureContext(raw);
  const result = responsibilitySlots(evidence);
  assert.equal(Object.keys(result.assignments).length, evidence.components.length);
  assert.notEqual(result.assignments['source:apps/web/src/components/repository-import.tsx'], result.assignments['source:apps/web/src/components/repository-overview.tsx']);
  assert.equal(result.assignments['source:apps/web/src/components/architecture/viewer.tsx'], result.assignments['source:apps/web/src/components/architecture/controls.tsx']);
  for (const source of evidence.components) {
    const slot = result.hints.find(item => item.id === result.assignments[source.id]);
    assert.equal(slot.category, ['api', 'service'].includes(source.type) ? 'backend' : source.type);
  }
});
