import type { ArchitectureNode } from './types.ts';
import { directory } from './types.ts';

/** Groups a file node under the first directory segment beneath a common app root
 * (src/app/pages/components/lib/services/server), e.g. "src/lib/foo.ts" -> "lib". */
function moduleGroupKey(node: ArchitectureNode): string {
  const path = node.path ?? '';
  const match = path.match(/^(?:.*?\/)?(?:src|app|pages|components|lib|services|server)\/([^/]+)/);
  return match ? match[1] : directory(path) || 'root';
}

/** A directory-grouped layout for the Modules view: same group/member shape as
 * layoutArchitecture, but groups are data-driven (one per top-ish directory) and
 * flow left-to-right, wrapping rows, instead of 5 fixed named slots. */
export function layoutModules(nodes: ArchitectureNode[]) {
  const buckets = new Map<string, ArchitectureNode[]>();
  for (const node of nodes) {
    const key = moduleGroupKey(node);
    const list = buckets.get(key) ?? [];
    list.push(node);
    buckets.set(key, list);
  }
  const sortedKeys = [...buckets.keys()].sort(
    (a, b) => buckets.get(b)!.length - buckets.get(a)!.length || a.localeCompare(b),
  );

  const groups = sortedKeys.map((key) => {
    const members = buckets.get(key)!.sort((a, b) => a.id.localeCompare(b.id));
    const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(members.length))));
    return {
      id: `boundary:module:${key}`,
      category: key,
      label: key,
      width: columns * 200 + 48,
      height: Math.ceil(members.length / columns) * 142 + 88,
      position: { x: 0, y: 0 },
      members: members.map((node, index) => ({
        node,
        position: { x: 24 + (index % columns) * 200, y: 64 + Math.floor(index / columns) * 142 },
      })),
    };
  });

  const maxRowWidth = 1400;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const group of groups) {
    if (x > 0 && x + group.width > maxRowWidth) {
      x = 0;
      y += rowHeight + 120;
      rowHeight = 0;
    }
    group.position = { x, y };
    x += group.width + 150;
    rowHeight = Math.max(rowHeight, group.height);
  }
  return groups;
}
