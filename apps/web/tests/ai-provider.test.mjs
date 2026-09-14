import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { getAIProvider } from '../src/lib/ai/provider.ts';
import { ollamaProvider } from '../src/lib/ai/providers/ollama.ts';
import { gatewayProvider } from '../src/lib/ai/providers/gateway.ts';

function withEnv(overrides, run) {
  const original = {};
  for (const key of Object.keys(overrides)) original[key] = process.env[key];
  Object.assign(process.env, overrides);
  try { return run(); }
  finally { for (const key of Object.keys(overrides)) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  } }
}

test('getAIProvider throws a clear, actionable error when AI_PROVIDER is unset', () => {
  withEnv({ AI_PROVIDER: undefined }, () => {
    delete process.env.AI_PROVIDER;
    assert.throws(() => getAIProvider(), /Missing AI provider configuration/);
  });
});

test('getAIProvider throws on an unrecognized AI_PROVIDER instead of silently falling back', () => {
  withEnv({ AI_PROVIDER: 'openai-direct' }, () => {
    assert.throws(() => getAIProvider(), /Unsupported AI_PROVIDER "openai-direct"/);
  });
});

test('getAIProvider resolves "ollama" and "gateway" to callable providers', () => {
  withEnv({ AI_PROVIDER: 'ollama' }, () => assert.equal(typeof getAIProvider(), 'function'));
  withEnv({ AI_PROVIDER: 'gateway' }, () => assert.equal(typeof getAIProvider(), 'function'));
});

const schema = z.strictObject({ ok: z.boolean() });

test('ollamaProvider posts schema-constrained structured output to the configured Ollama endpoint', async () => {
  const provider = ollamaProvider(async (url, init) => {
    assert.equal(url, 'http://localhost:11434/api/chat');
    const body = JSON.parse(init.body);
    assert.deepEqual(body.format, z.toJSONSchema(schema));
    assert.equal(body.messages[0].content, 'sys');
    assert.equal(body.messages[1].content, 'user');
    return Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify({ ok: true }) } });
  });
  const result = await provider({ systemPrompt: 'sys', userPrompt: 'user', schema });
  assert.deepEqual(result, { ok: true });
});

for (const [name, fetcher, match] of [
  ['unreachable host', async () => { throw new Error('fetch failed'); }, /Cannot reach Ollama/],
  ['timeout', async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); }, /timed out/],
  ['model not found', async () => new Response('', { status: 404 }), /model not found/],
  ['non-ok status', async () => new Response('', { status: 500 }), /request failed \(500\)/],
  ['incomplete response', async () => Response.json({ done: false }), /incomplete response/],
  ['invalid JSON content', async () => Response.json({ done: true, message: { content: 'not json' } }), /invalid JSON/],
]) test(`ollamaProvider classifies: ${name}`, async () => {
  await assert.rejects(ollamaProvider(fetcher)({ systemPrompt: 's', userPrompt: 'u', schema }), match);
});

test('gatewayProvider requires AI_MODEL and AI_GATEWAY_API_KEY before calling the SDK', async () => {
  await withEnv({ AI_MODEL: undefined, AI_GATEWAY_API_KEY: undefined }, async () => {
    delete process.env.AI_MODEL; delete process.env.AI_GATEWAY_API_KEY;
    await assert.rejects(gatewayProvider(async () => { throw new Error('should not be called'); })({ systemPrompt: 's', userPrompt: 'u', schema }), /Set AI_MODEL/);
    process.env.AI_MODEL = 'anthropic/claude-sonnet-4-5';
    await assert.rejects(gatewayProvider(async () => { throw new Error('should not be called'); })({ systemPrompt: 's', userPrompt: 'u', schema }), /AI_GATEWAY_API_KEY/);
  });
});

test('gatewayProvider passes the same schema/prompts through to generateObject and returns its object verbatim', async () => {
  await withEnv({ AI_MODEL: 'anthropic/claude-sonnet-4-5', AI_GATEWAY_API_KEY: 'test-key' }, async () => {
    const provider = gatewayProvider(async options => {
      assert.equal(options.model, 'anthropic/claude-sonnet-4-5');
      assert.equal(options.schema, schema);
      assert.equal(options.system, 'sys');
      assert.equal(options.prompt, 'user');
      assert.equal(options.temperature, 0);
      return { object: { ok: true } };
    });
    const result = await provider({ systemPrompt: 'sys', userPrompt: 'user', schema });
    assert.deepEqual(result, { ok: true });
  });
});

test('gatewayProvider never falls back to Ollama/localhost on failure', async () => {
  await withEnv({ AI_MODEL: 'anthropic/claude-sonnet-4-5', AI_GATEWAY_API_KEY: 'test-key' }, async () => {
    const calls = [];
    await assert.rejects(gatewayProvider(async options => { calls.push(options); throw new Error('network down'); })({ systemPrompt: 's', userPrompt: 'u', schema }));
    assert.equal(calls.length, 1);
    assert.ok(!JSON.stringify(calls).includes('localhost'));
  });
});
