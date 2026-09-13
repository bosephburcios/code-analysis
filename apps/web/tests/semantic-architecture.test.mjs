import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildArchitectureContext } from '../src/lib/architecture/build-ai-context.ts';
import { validateSemanticArchitecture } from '../src/lib/architecture/validate-semantic.ts';
import { generateSemanticArchitecture, ollamaProvider } from '../src/lib/ai/generate-semantic-architecture.ts';

const raw = {
  nodes: [
    { id: 'web', type: 'frontend', label: 'Next.js App', path: 'apps/web', metadata: { evidence: 'apps/web/next.config.ts' } },
    { id: 'api', type: 'api', label: 'API Routes', path: 'apps/web', metadata: { evidence: 'apps/web/src/app/api/import/route.ts' } },
    { id: 'db', type: 'database', label: 'Prisma / PostgreSQL', path: 'apps/web/prisma/schema.prisma', metadata: { evidence: 'apps/web/prisma/schema.prisma' } },
  ],
  edges: [{ id: 'web-api', source: 'web', target: 'api', kind: 'sync' }, { id: 'api-db', source: 'api', target: 'db', kind: 'data' }],
};
const context = buildArchitectureContext(raw);
const graph = () => ({
  nodes: [
    { id: 'app', label: 'Application', type: 'feature', description: 'Groups the frontend and API.', confidence: 0.8, sourceNodeIds: ['web', 'api'], files: [], technologies: ['Next.js'] },
    { id: 'persistence', label: 'Persistence', type: 'database', description: 'Prisma database configuration.', confidence: 0.9, sourceNodeIds: ['db'], files: [], technologies: ['Prisma', 'PostgreSQL'] },
  ],
  edges: [{ id: 'queries', source: 'app', target: 'persistence', label: 'queries (inferred)', type: 'data', sourceEdgeIds: ['api-db'] }],
});
test('validates compression and reconstructs the complete evidence trail', () => {
  const result = validateSemanticArchitecture(graph(), context);
  assert.deepEqual(result.nodes[0].files, ['apps/web/next.config.ts', 'apps/web/src/app/api/import/route.ts']);
  assert.equal(result.nodes[0].confidence, 0.8);
  assert.match(context.relationships[0].basis, /not a verified runtime call/);
});
for (const [name, change] of [
  ['missing confidence', g => delete g.nodes[0].confidence],
  ['confidence over one', g => g.nodes[0].confidence = 1.1],
  ['negative confidence', g => g.nodes[0].confidence = -0.1],
  ['invented file', g => g.nodes[0].files.push('fake/auth.ts')],
  ['invented technology', g => g.nodes[0].technologies.push('Stripe')],
  ['unknown component', g => g.nodes[0].sourceNodeIds.push('unknown')],
  ['duplicate source ownership', g => g.nodes[1].sourceNodeIds.push('web')],
  ['missing component', g => g.nodes[0].sourceNodeIds.pop()],
  ['new edge', g => g.edges[0].sourceEdgeIds = ['fake']],
  ['reversed edge', g => { g.edges[0].source = 'persistence'; g.edges[0].target = 'app'; }],
  ['changed edge type', g => g.edges[0].type = 'async'],
  ['missing cross-group edge', g => g.edges = []],
  ['duplicate node IDs', g => g.nodes[1].id = 'app'],
  ['database renamed to feature', g => g.nodes[1].type = 'feature'],
]) test(`rejects ${name}`, () => { const g = graph(); change(g); assert.throws(() => validateSemanticArchitecture(g, context)); });
test('validates results from any provider and never trusts provider output', async () => {
  const result = await generateSemanticArchitecture(context, async () => graph());
  assert.equal(result.nodes.length, 2);
  await assert.rejects(generateSemanticArchitecture(context, async () => ({ nodes: [], edges: [] })));
});
test('Ollama uses schema constrained output and separates instructions from evidence', async () => {
  const provider = ollamaProvider(async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.format.properties.nodes.items.properties.confidence.maximum, 1);
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /untrusted data/);
    assert.equal(body.stream, false);
    const aliased = graph();
    aliased.nodes[0].sourceNodeIds = ['c0', 'c1'];
    aliased.nodes[1].sourceNodeIds = ['c2'];
    aliased.edges[0].sourceEdgeIds = ['r1'];
    return Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(aliased) } });
  });
  const validated = await generateSemanticArchitecture(context, provider);
  assert.equal(validated.nodes.length, 2);
  assert.deepEqual(validated.nodes[0].sourceNodeIds, ['web', 'api']);
  assert.deepEqual(validated.edges[0].sourceEdgeIds, ['api-db']);
  await assert.rejects(generateSemanticArchitecture(context, ollamaProvider(async () => Response.json({ done: true, done_reason: 'length', message: { content: '{}' } }))), /incomplete/);
});
test('rejects oversized context rather than silently omitting components', () => {
  assert.throws(() => buildArchitectureContext({ nodes: Array.from({ length: 501 }, (_, i) => ({ id: String(i), type: 'infra', label: 'Docker' })), edges: [] }), /context limit/);
});

test('role bundles retain every raw app ID and evidence file', async () => {
  const evidence = buildArchitectureContext({ nodes: Array.from({ length: 94 }, (_, i) => ({ id: `app-${i}`, type: 'frontend', label: 'Next.js App', metadata: { evidence: `apps/${i}/next.config.ts` } })), edges: [] });
  const result = await generateSemanticArchitecture(evidence, ollamaProvider(async (_url, init) => {
    const prompt = JSON.parse(init.body).messages[1].content;
    assert.match(prompt, /"sourceCount":94/);
    const graph = { nodes: [{ id: 'frontends', label: 'Next.js Applications', type: 'frontend', description: 'A collection of Next.js application configurations.', confidence: 0.7, sourceNodeIds: ['c0'], files: [], technologies: [] }], edges: [] };
    return Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(graph) } });
  }));
  assert.equal(result.nodes[0].sourceNodeIds.length, 94);
  assert.equal(result.nodes[0].files.length, 94);
});
