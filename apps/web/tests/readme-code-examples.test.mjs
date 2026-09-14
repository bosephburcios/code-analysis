import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectCodeExampleCandidates, toReadmeCodeExample } from '../src/lib/readme/select-code-examples.ts';

function node(role, confidence = 0.8, id = role) {
  return { id, label: id, role, confidence, description: 'd', sourceNodeIds: ['s'], files: [], technologies: [] };
}

test('prioritizes implementation responsibilities before physical stores', () => {
  const semantic = { nodes: [node('ui'), node('service'), node('database'), node('api')] };
  const ordered = selectCodeExampleCandidates(semantic).map(n => n.role);
  assert.deepEqual(ordered, ['api', 'service', 'database', 'ui']);
});

test('breaks ties within a role by confidence, descending', () => {
  const semantic = { nodes: [node('api', 0.5, 'low'), node('api', 0.9, 'high')] };
  const ordered = selectCodeExampleCandidates(semantic).map(n => n.id);
  assert.deepEqual(ordered, ['high', 'low']);
});

test('limits candidates to the requested count', () => {
  const semantic = { nodes: Array.from({ length: 12 }, (_, i) => node('service', 0.5, `n${i}`)) };
  assert.equal(selectCodeExampleCandidates(semantic, 5).length, 5);
});

test('returns null for feature-kind evidence (no single file fairly represents it)', () => {
  const evidence = { kind: 'feature', items: [{ path: 'a.ts', code: 'x', startLine: 1, endLine: 1, truncated: false, showCode: false }] };
  assert.equal(toReadmeCodeExample(node('service'), evidence), null);
});

test('returns null when a non-feature component has no evidence items at all', () => {
  const evidence = { kind: 'database', items: [] };
  assert.equal(toReadmeCodeExample(node('data_access'), evidence), null);
});

test('takes the top-ranked item verbatim for a non-feature component', () => {
  const evidence = { kind: 'api_route', items: [{ path: 'route.ts', code: 'return fetch("https://api.github.com/repos/a/b");', startLine: 3, endLine: 3, truncated: false, showCode: true }] };
  const example = toReadmeCodeExample(node('api'), evidence);
  assert.equal(example.path, 'route.ts');
  assert.equal(example.code, 'return fetch("https://api.github.com/repos/a/b");');
  assert.equal(example.truncated, false);
});

test('truncates to maxLines without rewriting any retained line', () => {
  const code = Array.from({ length: 30 }, (_, i) => `processFile(${i});`).join('\n');
  const evidence = { kind: 'database', items: [{ path: 'db.ts', code, startLine: 1, endLine: 30, truncated: false, showCode: true }] };
  const example = toReadmeCodeExample(node('data_access'), evidence, 20);
  assert.equal(example.code.split('\n').length, 20);
  assert.equal(example.code, code.split('\n').slice(0, 20).join('\n'));
  assert.equal(example.truncated, true);
  assert.equal(example.endLine, 20);
});


test('a real request outranks a route signature and import-only evidence', () => {
  const evidence = { kind: 'api_route', items: [
    { path: 'route.ts', code: 'export async function GET() {', startLine: 2, endLine: 2, score: 20 },
    { path: 'route.ts', code: "import { fetchTree } from './tree';", startLine: 1, endLine: 1, score: 1 },
    { path: 'route.ts', code: 'const tree = await fetchTree();\nreturn analyze(tree);', startLine: 8, endLine: 9, score: 9 },
  ] };
  assert.equal(toReadmeCodeExample(node('api'), evidence).startLine, 8);
});

test('feature evidence can supply meaningful processing code without enabling raw code in the inspector', () => {
  const evidence = { kind: 'feature', items: [{ path: 'graph.ts', code: 'export function buildGraph(files) {\n  const nodes = files.map(detectNode);\n  return { nodes };\n}', startLine: 10, endLine: 13, showCode: false, score: 10 }] };
  assert.ok(toReadmeCodeExample(node('processor'), evidence));
});

test('comments and empty route declarations do not count as implementation behavior', () => {
  const evidence = { kind: 'api_route', items: [{ path: 'route.ts', code: '// fetch(url)\nexport function GET() {}', startLine: 1, endLine: 2 }] };
  assert.equal(toReadmeCodeExample(node('api'), evidence), null);
});
