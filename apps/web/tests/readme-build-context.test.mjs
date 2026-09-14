import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { buildReadmeContext } from '../src/lib/readme/build-context.ts';

function blobSha(content) {
  return createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
}
function blob(content) {
  return { sha: blobSha(content), content, encoded: Buffer.from(content).toString('base64') };
}

const routeSource = `export async function GET() { return fetch('https://api.github.com/repos/x/y'); }\n`;
const packageJson = JSON.stringify({ scripts: { dev: 'next dev', build: 'next build' } });
const envExample = 'DATABASE_URL=\nGITHUB_TOKEN=\n';

const blobs = {
  'apps/web/src/app/api/repositories/route.ts': blob(routeSource),
  'package.json': blob(packageJson),
  '.env.example': blob(envExample),
};

const treeSha = 'a'.repeat(40);
const tree = [
  { path: 'apps/web/src/app/api/repositories/route.ts', type: 'blob', sha: blobs['apps/web/src/app/api/repositories/route.ts'].sha },
  { path: 'package.json', type: 'blob', sha: blobs['package.json'].sha },
  { path: '.env.example', type: 'blob', sha: blobs['.env.example'].sha },
  { path: 'apps/web/src/lib/util.ts', type: 'blob', sha: blobSha('export const x = 1;\n') },
];

async function fetcher(url) {
  const href = String(url);
  if (href.includes(`/git/trees/${treeSha}`)) return Response.json({ sha: treeSha, truncated: false, tree });
  const match = /\/git\/blobs\/([a-f0-9]{40})$/.exec(href);
  if (match) {
    const entry = Object.values(blobs).find(candidate => candidate.sha === match[1]);
    if (entry) return Response.json({ encoding: 'base64', size: entry.content.length, content: entry.encoded });
    return Response.json({ encoding: 'base64', size: 2, content: Buffer.from('x;').toString('base64') });
  }
  throw new Error(`Unexpected fetch: ${href}`);
}

const analysis = {
  version: 1, treeSha, fileCount: 4, ignoredFileCount: 0,
  languages: [{ name: 'TypeScript', count: 4, percentage: 100 }], tools: ['Next.js'],
};

const semantic = {
  nodes: [
    { id: 'api', label: 'Repository API', type: 'backend', role: 'api', description: 'Handles repository requests.', confidence: 0.9, sourceNodeIds: ['s1'], files: ['apps/web/src/app/api/repositories/route.ts'], technologies: ['Next.js'] },
    { id: 'util', label: 'Utilities', type: 'backend', role: 'service', description: 'Shared helpers.', confidence: 0.6, sourceNodeIds: ['s2'], files: ['apps/web/src/lib/util.ts'], technologies: [] },
  ],
  edges: [],
};

const rawGraph = {
  nodes: [
    { id: 's1', type: 'api', label: 'Repository API', path: 'apps/web/src/app/api/repositories/route.ts', metadata: { evidence: 'apps/web/src/app/api/repositories/route.ts' } },
    { id: 's2', type: 'service', label: 'Utilities', path: 'apps/web/src/lib/util.ts', metadata: { evidence: 'apps/web/src/lib/util.ts' } },
  ],
  edges: [],
};

test('assembles a full README context from analysis + semantic graph + GitHub source', async () => {
  const context = await buildReadmeContext({ repository: { owner: 'x', name: 'y', treeSha }, analysis, semantic, rawGraph }, fetcher);

  assert.equal(context.title, 'y');
  assert.equal(context.badges.length, 2); // TypeScript (language) + Next.js (tool, has a known logo)
  assert.equal(context.architecture.nodeCount, 2);
  assert.equal(context.components.length, 2);
  assert.deepEqual(context.components.map(c => c.role), ['Backend API', 'Service']);

  // The api-route component has real, single-file evidence -> a code example
  // (the evidence system captures just the route signature for `api_route`
  // kind, not the full handler body — this is real code, not fabricated).
  const example = context.codeExamples.find(e => e.componentId === 'api');
  assert.ok(example, 'expected a code example for the api component');
  assert.equal(example.path, 'apps/web/src/app/api/repositories/route.ts');
  assert.match(example.code, /fetch\('https:\/\/api.github.com/);
  assert.ok(!example.code.includes('export async function GET'));

  assert.deepEqual(context.techStack.find(entry => entry.category === 'Languages').items.map(i => i.name), ['TypeScript']);
  assert.ok(context.projectStructure.some(entry => entry.path === 'apps/web/src/app'));

  // package.json exists at root with real scripts -> Getting Started is populated.
  assert.equal(context.gettingStarted.packageManager, 'npm');
  assert.deepEqual(context.gettingStarted.scripts, [{ name: 'dev', command: 'npm run dev' }, { name: 'build', command: 'npm run build' }]);
  assert.deepEqual(context.gettingStarted.envVars, ['DATABASE_URL', 'GITHUB_TOKEN']);
});

test('Getting Started falls through to a nested app manifest when there is no root package.json at all (CodeMap\'s own repo shape)', async () => {
  const nestedPackageJson = JSON.stringify({ scripts: { dev: 'next dev', build: 'next build' } });
  const nestedBlobs = {
    'apps/web/package.json': blob(nestedPackageJson),
    'apps/web/package-lock.json': blob('{}'),
    'apps/web/src/app/api/repositories/route.ts': blob(routeSource),
  };
  const nestedTree = [
    { path: 'apps/web/package.json', type: 'blob', sha: nestedBlobs['apps/web/package.json'].sha },
    { path: 'apps/web/package-lock.json', type: 'blob', sha: nestedBlobs['apps/web/package-lock.json'].sha },
    { path: 'apps/web/src/app/api/repositories/route.ts', type: 'blob', sha: nestedBlobs['apps/web/src/app/api/repositories/route.ts'].sha },
  ];
  async function nestedFetcher(url) {
    const href = String(url);
    if (href.includes(`/git/trees/${treeSha}`)) return Response.json({ sha: treeSha, truncated: false, tree: nestedTree });
    const match = /\/git\/blobs\/([a-f0-9]{40})$/.exec(href);
    const entry = match && Object.values(nestedBlobs).find(candidate => candidate.sha === match[1]);
    if (entry) return Response.json({ encoding: 'base64', size: entry.content.length, content: entry.encoded });
    throw new Error(`Unexpected fetch: ${href}`);
  }
  const context = await buildReadmeContext({ repository: { owner: 'x', name: 'y', treeSha }, analysis, semantic, rawGraph }, nestedFetcher);
  assert.equal(context.gettingStarted.packageManager, 'npm');
  assert.equal(context.gettingStarted.installCommand, 'cd apps/web && npm install');
  assert.deepEqual(context.gettingStarted.scripts, [
    { name: 'dev', command: 'cd apps/web && npm run dev' },
    { name: 'build', command: 'cd apps/web && npm run build' },
  ]);
});
