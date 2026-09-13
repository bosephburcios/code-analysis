import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutArchitecture } from '../src/lib/architecture/layout-graph.ts';

test('groups all components once and keeps them within non-overlapping boundaries', () => {
  const types = ['frontend', 'api', 'service', 'database', 'external', 'infra'];
  const nodes = Array.from({ length: 94 }, (_, i) => ({ id: String(i), type: types[i % types.length], label: `Component ${i}` }));
  const groups = layoutArchitecture(nodes);
  assert.equal(groups.flatMap(group => group.members).length, nodes.length);
  assert.deepEqual(groups, layoutArchitecture([...nodes].reverse()));
  for (const group of groups) {
    for (const member of group.members) {
      assert.ok(member.position.x >= 0 && member.position.x + 176 <= group.width);
      assert.ok(member.position.y >= 0 && member.position.y + 118 <= group.height);
    }
    for (const other of groups) {
      if (other.id === group.id) continue;
      const overlap = group.position.x < other.position.x + other.width && group.position.x + group.width > other.position.x && group.position.y < other.position.y + other.height && group.position.y + group.height > other.position.y;
      assert.equal(overlap, false);
    }
  }
});
test('supports empty and single-layer graphs', () => {
  assert.deepEqual(layoutArchitecture([]), []);
  const groups = layoutArchitecture([{ id: 'db', label: 'Database', type: 'database' }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members[0].node.id, 'db');
});
