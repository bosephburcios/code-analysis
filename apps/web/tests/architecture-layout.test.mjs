import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutArchitecture } from '../src/lib/architecture/layout-graph.ts';

test('groups all components once and keeps them within non-overlapping boundaries', async () => {
  const types = ['frontend', 'api', 'service', 'database', 'external', 'infra'];
  const nodes = Array.from({ length: 94 }, (_, i) => ({ id: String(i), type: types[i % types.length], label: `Component ${i}` }));
  const groups = await layoutArchitecture(nodes);
  assert.equal(groups.flatMap(group => group.members).length, nodes.length);

  // ELK's crossing-minimization is seeded by input order, so exact geometry
  // isn't guaranteed order-independent — but which nodes land in which
  // top-level group should be, since that's driven by node.type alone.
  const idsByGroup = groups.map(group => group.members.map(member => member.node.id).sort());
  const reversed = await layoutArchitecture([...nodes].reverse());
  assert.deepEqual(reversed.map(group => group.members.map(member => member.node.id).sort()), idsByGroup);

  for (const group of groups) {
    for (const member of group.members) {
      const container = member.groupId ? (group.subGroups ?? []).find(sub => sub.id === member.groupId) : group;
      assert.ok(container, `no container found for member ${member.node.id}`);
      assert.ok(member.position.x >= 0 && member.position.x + 176 <= container.width);
      assert.ok(member.position.y >= 0 && member.position.y + 118 <= container.height);
    }
    for (const other of groups) {
      if (other.id === group.id) continue;
      const overlap = group.position.x < other.position.x + other.width && group.position.x + group.width > other.position.x && group.position.y < other.position.y + other.height && group.position.y + group.height > other.position.y;
      assert.equal(overlap, false);
    }
  }
});
test('supports empty and single-layer graphs', async () => {
  assert.deepEqual(await layoutArchitecture([]), []);
  const groups = await layoutArchitecture([{ id: 'db', label: 'Database', type: 'database' }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members[0].node.id, 'db');
});
