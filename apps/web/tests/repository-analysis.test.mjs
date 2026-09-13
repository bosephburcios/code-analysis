import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ingestRepository, summarize, isIgnored } from '../src/lib/repository-analysis.ts';

const file = (path) => ({ path, type: 'blob', sha: path });
test('ignores nested dependencies and generated files without excluding ordinary source', () => {
  for (const path of ['apps/web/node_modules/x/a.js', 'src/generated/client.ts', 'dist/index.js', 'yarn.lock', 'app.min.js', 'x.pyc']) assert.equal(isIgnored(path), true);
  assert.equal(isIgnored('src/building.ts'), false);
  assert.equal(isIgnored('.github/workflows/test.yml'), false);
});
test('counts retained files and rounds language percentages to 100', () => {
  const analysis = summarize(['a.ts', 'b.py', 'c.css', 'node_modules/x.js'].map(file), 'tree', {});
  assert.equal(analysis.fileCount, 3);
  assert.equal(analysis.ignoredFileCount, 1);
  assert.equal(analysis.languages.reduce((sum, language) => sum + language.percentage, 0), 100);
  assert.deepEqual(summarize([], 'empty', {}).languages, []);
});
test('detects monorepo tools using nested manifests and ignores vendored tools', () => {
  const paths = ['apps/web/package.json', 'apps/web/schema.prisma', 'apps/api/requirements.txt', 'Dockerfile', 'vendor/package.json'];
  const analysis = summarize(paths.map(file), 'tree', {
    'apps/web/package.json': JSON.stringify({ dependencies: { next: '1', '@aws-sdk/client-s3': '1' }, devDependencies: { prisma: '1' } }),
    'apps/web/schema.prisma': 'datasource db { provider = "postgresql" }',
    'apps/api/requirements.txt': 'fastapi==1.0',
    'vendor/package.json': '{"dependencies":{"vue":"1"}}',
  });
  assert.deepEqual(analysis.tools, ['AWS SDK', 'Docker', 'FastAPI', 'Next.js', 'PostgreSQL', 'Prisma']);
});
test('uses tree blob SHAs for consistent manifest reads', async () => {
  const requests = [];
  const fetcher = (async (url) => {
    requests.push(String(url));
    return Response.json(requests.length === 1
      ? { sha: 'snapshot', truncated: false, tree: [{ ...file('package.json'), sha: 'blobsha' }, file('src/index.ts')] }
      : { encoding: 'base64', size: 40, content: Buffer.from('{"dependencies":{"next":"1"}}').toString('base64') });
  });
  const analysis = await ingestRepository('owner', 'repo', 'feature/main', fetcher);
  assert.match(requests[0], /feature%2Fmain/);
  assert.match(requests[1], /git\/blobs\/blobsha$/);
  assert.equal(analysis.treeSha, 'snapshot');
  assert.deepEqual(analysis.tools, ['Next.js']);
});
test('rejects truncated trees and labels incomplete manifest coverage', async () => {
  await assert.rejects(ingestRepository('a', 'b', 'main', (async () => Response.json({ truncated: true, tree: [] }))), /complete tree limit/);
  let calls = 0;
  const partial = await ingestRepository('a', 'b', 'main', (async () => ++calls === 1
    ? Response.json({ sha: 's', truncated: false, tree: [file('package.json')] })
    : new Response('', { status: 429 })));
  assert.equal(partial.fileCount, 1);
  assert.equal(partial.manifestCoverage.complete, false);
  assert.equal(partial.manifestCoverage.scanned, 0);
  assert.match(partial.manifestCoverage.reason, /rate limit/);
});

test('accepts over 150 manifests and deduplicates blob reads', async () => {
  let calls = 0;
  const tree = Array.from({ length: 200 }, (_, i) => ({ ...file(`packages/p${i}/package.json`), sha: 'shared' }));
  const analysis = await ingestRepository('a', 'b', 'main', async () => {
    calls++;
    return Response.json(calls === 1 ? { sha: 'snapshot', truncated: false, tree } : {
      encoding: 'base64', size: 30, content: Buffer.from('{"dependencies":{"next":"1"}}').toString('base64'),
    });
  });
  assert.equal(calls, 2);
  assert.equal(analysis.fileCount, 200);
  assert.deepEqual(analysis.manifestCoverage, { scanned: 200, total: 200, complete: true });
  assert.deepEqual(analysis.tools, ['Next.js']);
});
