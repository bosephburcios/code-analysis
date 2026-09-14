import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateReadmeProse, ollamaReadmeProvider } from '../src/lib/ai/generate-readme-prose.ts';
import { validateReadmeProse } from '../src/lib/readme/validate-readme-prose.ts';
import { assembleGeneratedReadme } from '../src/lib/readme/assemble-readme.ts';

function withEnv(overrides, run) {
  const original = {};
  for (const key of Object.keys(overrides)) original[key] = process.env[key];
  Object.assign(process.env, overrides);
  try { return run(); }
  finally { for (const key of Object.keys(overrides)) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  } }
}

const context = {
  title: 'code-analysis',
  badges: [],
  architecture: { imagePath: 'docs/architecture.png', nodeCount: 2, edgeCount: 1 },
  candidateFlows: [{ id: 'flow-0', nodeIds: ['ui', 'api'], edgeIds: ['e1'], nodeLabels: ['UI', 'API'], nodeDescriptions: ['d1', 'd2'], edgeLabels: ['calls'] }],
  components: [{ id: 'ui', label: 'UI', role: 'Frontend', description: 'd1', technologies: [], files: [] }],
  codeExamples: [],
  techStack: [],
  projectStructure: [],
  gettingStarted: null,
};

const prose = () => ({ tagline: 'A repository analysis tool.', overview: 'Analyzes repositories and generates architecture diagrams.', flows: [{ id: 'flow-0', title: 'Import flow', description: 'UI calls API.' }] });

test('validates real provider output and rejects nothing when ids/order match', () => {
  const result = validateReadmeProse(prose(), context);
  assert.equal(result.tagline, 'A repository analysis tool.');
});

for (const [name, change] of [
  ['missing flow', p => p.flows.pop()],
  ['renamed flow id', p => p.flows[0].id = 'flow-1'],
  ['invented extra flow', p => p.flows.push({ id: 'flow-extra', title: 't', description: 'd' })],
  ['missing tagline', p => delete p.tagline],
  ['tagline too long', p => p.tagline = 'x'.repeat(200)],
]) test(`rejects ${name}`, () => { const p = prose(); change(p); assert.throws(() => validateReadmeProse(p, context)); });

test('generateReadmeProse validates any provider output before returning it', async () => {
  const result = await generateReadmeProse(context, async () => prose());
  assert.equal(result.flows.length, 1);
  await assert.rejects(generateReadmeProse(context, async () => ({ tagline: 'x', overview: 'y', flows: [] })));
});

test('assembleGeneratedReadme merges deterministic context with AI prose and derives image paths', () => {
  const result = assembleGeneratedReadme(context, prose(), { generatedAt: '2026-01-01T00:00:00.000Z', sourceSemanticGeneratedAt: null });
  assert.equal(result.tagline, 'A repository analysis tool.');
  assert.equal(result.keyFlows[0].title, 'Import flow');
  assert.equal(result.keyFlows[0].slug, 'import-flow');
  assert.equal(result.keyFlows[0].imagePath, 'docs/flows/import-flow.png');
  assert.deepEqual(result.keyFlows[0].nodeIds, ['ui', 'api']);
  assert.equal(result.components.length, 1);
});

test('Ollama uses schema-constrained output (exact flow count/ids) and separates instructions from evidence', async () => {
  const provider = ollamaReadmeProvider(async (_url, init) => {
    const body = JSON.parse(init.body);
    // A tuple-based ("items": false) encoding was tried first but Ollama's
    // JSON Schema -> grammar converter rejects it with a 400 — this asserts
    // the actual, Ollama-compatible shape: exactly one item per flow, each
    // id constrained to the known set via enum.
    assert.deepEqual(body.format.properties.flows.items.properties.id.enum, ['flow-0']);
    assert.equal(body.format.properties.flows.minItems, 1);
    assert.equal(body.format.properties.flows.maxItems, 1);
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /untrusted data/);
    assert.equal(body.stream, false);
    return Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(prose()) } });
  });
  const result = await generateReadmeProse(context, provider);
  assert.equal(result.overview, 'Analyzes repositories and generates architecture diagrams.');
});

test('classifies Ollama failure modes with the same message strings as architecture generation', async () => {
  await assert.rejects(generateReadmeProse(context, ollamaReadmeProvider(async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); })), /timed out/);
  await assert.rejects(generateReadmeProse(context, ollamaReadmeProvider(async () => new Response('', { status: 404 }))), /model not found/);
  await assert.rejects(generateReadmeProse(context, ollamaReadmeProvider(async () => Response.json({ done: true, message: { content: 'not json' } }))), /invalid JSON/);
});

test('with no explicit provider, generateReadmeProse dispatches through getAIProvider (AI_PROVIDER) just like architecture generation', async () => {
  await withEnv({ AI_PROVIDER: undefined }, async () => {
    delete process.env.AI_PROVIDER;
    await assert.rejects(generateReadmeProse(context), /Missing AI provider configuration/);
  });
  await withEnv({ AI_PROVIDER: 'ollama' }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify(prose()) } });
    try {
      const result = await generateReadmeProse(context);
      assert.equal(result.tagline, 'A repository analysis tool.');
    } finally { globalThis.fetch = originalFetch; }
  });
});
