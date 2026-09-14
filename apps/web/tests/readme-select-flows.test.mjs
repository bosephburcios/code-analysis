import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectCandidateFlows } from '../src/lib/readme/select-key-flows.ts';

function graph({ nodes, edges }) {
  return {
    nodes: nodes.map(node => ({ confidence: 0.8, sourceNodeIds: ['s'], files: [], technologies: [], description: 'd', ...node })),
    edges: edges.map(edge => ({ sourceEdgeIds: ['e'], label: 'flows', type: 'request', ...edge })),
  };
}

test('walks outward from an api/ui entry point through outgoing edges', () => {
  const semantic = graph({
    nodes: [
      { id: 'ui', label: 'UI', type: 'frontend', role: 'ui' },
      { id: 'api', label: 'API', type: 'backend', role: 'api' },
      { id: 'db', label: 'DB', type: 'database', role: 'database' },
    ],
    edges: [{ id: 'e1', source: 'ui', target: 'api' }, { id: 'e2', source: 'api', target: 'db' }],
  });
  const flows = selectCandidateFlows(semantic);
  assert.equal(flows.length, 1);
  assert.deepEqual(flows[0].nodeIds, ['ui', 'api', 'db']);
  assert.deepEqual(flows[0].edgeIds, ['e1', 'e2']);
});

test('drops single-node flows (an entry point with no outgoing edges)', () => {
  const semantic = graph({ nodes: [{ id: 'ui', label: 'UI', type: 'frontend', role: 'ui' }], edges: [] });
  assert.deepEqual(selectCandidateFlows(semantic), []);
});

test('deduplicates near-identical flows from different entry points, keeping the larger', () => {
  const semantic = graph({
    nodes: [
      { id: 'ui1', label: 'UI 1', type: 'frontend', role: 'ui' },
      { id: 'ui2', label: 'UI 2', type: 'frontend', role: 'ui' },
      { id: 'api', label: 'API', type: 'backend', role: 'api' },
      { id: 'db', label: 'DB', type: 'database', role: 'database' },
      { id: 'extra', label: 'Extra', type: 'backend', role: 'service' },
    ],
    edges: [
      { id: 'e1', source: 'ui1', target: 'api' }, { id: 'e2', source: 'ui2', target: 'api' },
      { id: 'e3', source: 'api', target: 'db' }, { id: 'e4', source: 'api', target: 'extra' },
    ],
  });
  const flows = selectCandidateFlows(semantic);
  // Both ui1->api->{db,extra} and ui2->api->{db,extra} overlap heavily (same
  // downstream nodes) — only one should survive.
  assert.equal(flows.length, 1);
  assert.equal(flows[0].nodeIds.length, 4);
});

test('caps the number of returned flows at maxFlows', () => {
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 6; i++) {
    nodes.push({ id: `ui${i}`, label: `UI ${i}`, type: 'frontend', role: 'ui' });
    nodes.push({ id: `api${i}`, label: `API ${i}`, type: 'backend', role: 'api' });
    edges.push({ id: `e${i}`, source: `ui${i}`, target: `api${i}` });
  }
  const flows = selectCandidateFlows(graph({ nodes, edges }), { maxFlows: 3 });
  assert.equal(flows.length, 3);
});

test('falls back to frontend-typed nodes as entry points when no role field exists', () => {
  const semantic = graph({
    nodes: [
      { id: 'ui', label: 'UI', type: 'frontend' },
      { id: 'api', label: 'API', type: 'backend' },
    ],
    edges: [{ id: 'e1', source: 'ui', target: 'api' }],
  });
  const flows = selectCandidateFlows(semantic);
  assert.equal(flows.length, 1);
  assert.deepEqual(flows[0].nodeIds, ['ui', 'api']);
});
