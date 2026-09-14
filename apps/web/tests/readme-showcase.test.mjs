import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildExportPackageEntries } from '../src/lib/readme/build-export-package.ts';
import { selectWorkflowSteps } from '../src/lib/readme/select-key-flows.ts';
import { selectFileEvidence } from '../src/lib/architecture/select-evidence.ts';
import { toReadmeCodeExample } from '../src/lib/readme/select-code-examples.ts';

test('default export contains one architecture visual and no workflow images', () => {
  const entries = buildExportPackageEntries('# Project', { architecture: new Blob(['architecture']), flows: { 'docs/flows/import.png': new Blob(['flow']) } });
  assert.deepEqual(entries.map(entry => entry.path), ['README.md', 'docs/architecture.png']);
});

test('workflow image assets require explicit opt-in', () => {
  const entries = buildExportPackageEntries('# Project', { architecture: new Blob(), flows: { 'docs/flows/import.png': new Blob() } }, { includeFlowImages: true });
  assert.equal(entries.length, 3);
});

test('workflow steps select up to four distinct responsibilities rather than duplicate graph walks', () => {
  const nodes = ['ui', 'api', 'processor', 'service', 'database', 'external'].map(role => ({ id: role, role, confidence: 0.9 }));
  const steps = selectWorkflowSteps({ nodes, edges: nodes.slice(1).map((node, index) => ({ id: String(index), source: nodes[index].id, target: node.id })) });
  assert.equal(steps.length, 4);
  assert.deepEqual(steps.flatMap(step => step.nodeIds), ['ui', 'api', 'processor', 'service']);
  assert.equal(selectWorkflowSteps({ nodes: [], edges: [] }).length, 0);
});

test('README can use a real function body while the inspector retains its compact definition', () => {
  const context = { kind: 'feature', definesComponent: true, lines: [], names: [], hosts: [], packages: [], models: [] };
  const source = 'export function buildGraph(files) {\n  const nodes = files.map(detectNode);\n  return { nodes };\n}';
  const inspector = selectFileEvidence('graph.ts', source, context);
  const readme = selectFileEvidence('graph.ts', source, context, 'readme');
  const node = { id: 'graph', label: 'Graph Construction', description: 'Builds graph nodes from repository files.' };
  assert.equal(toReadmeCodeExample(node, { items: inspector }), null);
  assert.equal(toReadmeCodeExample(node, { items: readme }).code, source);
});
