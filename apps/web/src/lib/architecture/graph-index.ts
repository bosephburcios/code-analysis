import type { ArchitectureEdge } from './types.ts';

/** Inverts source -> target edges into target -> [sources] ("imported by"). */
export function invertEdges(edges: ArchitectureEdge[]): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  for (const edge of edges) {
    const list = reverse.get(edge.target) ?? [];
    if (!list.includes(edge.source)) list.push(edge.source);
    reverse.set(edge.target, list);
  }
  return reverse;
}

/** BFS over the reverse-dependency index. Returns transitive dependents only (not startId itself). */
export function transitiveImpact(startId: string, reverse: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const dependent of reverse.get(id) ?? []) {
      if (!visited.has(dependent)) {
        visited.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return visited;
}
