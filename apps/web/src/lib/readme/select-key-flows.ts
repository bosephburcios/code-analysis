import type { SemanticArchitecture } from "../architecture/semantic-schema.ts";
import { readmeRole } from './component-role.ts';

export type CandidateFlow = {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
};

// Product steps describe distinct responsibilities; they do not each redraw a graph.
export function selectWorkflowSteps(semantic: SemanticArchitecture): CandidateFlow[] {
  const order = ['ui', 'api', 'processor', 'service', 'data_access', 'database', 'external'];
  const connected = new Set(semantic.edges.flatMap(edge => [edge.source, edge.target]));
  const candidates = semantic.nodes.filter(node => connected.has(node.id) || !semantic.edges.length);
  const selected: SemanticArchitecture['nodes'] = [];
  for (const role of order) {
    const match = candidates.filter(node => readmeRole(node) === role).sort((a, b) => b.confidence - a.confidence)[0];
    if (match) selected.push(match);
    if (selected.length === 4) break;
  }
  for (const node of candidates) { if (selected.length === 4) break; if (!selected.includes(node)) selected.push(node); }
  return selected.map((node, index) => ({ id: `flow-${index}`, nodeIds: [node.id], edgeIds: [] }));
}

function jaccard(a: Set<string>, b: Set<string>) {
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Picks a small set of representative "key flows" — a starting component and
// the chain of components it drives — purely by graph shape. The model never
// chooses membership; it only writes a title/description for a flow this
// function already assembled from real edges.
export function selectCandidateFlows(
  semantic: SemanticArchitecture,
  options?: { maxFlows?: number; maxHops?: number; maxNodesPerFlow?: number },
): CandidateFlow[] {
  const maxFlows = options?.maxFlows ?? 4;
  const maxHops = options?.maxHops ?? 4;
  const maxNodesPerFlow = options?.maxNodesPerFlow ?? 8;

  const inDegree = new Map<string, number>();
  for (const node of semantic.nodes) inDegree.set(node.id, 0);
  for (const edge of semantic.edges)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);

  const outgoing = new Map<string, SemanticArchitecture["edges"]>();
  for (const edge of semantic.edges)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);

  const hasRoles = semantic.nodes.some((node) => node.role);
  const roleCandidates = hasRoles
    ? semantic.nodes.filter((node) => node.role === "ui" || node.role === "api")
    : semantic.nodes.filter((node) => node.type === "frontend");
  // A node that's itself downstream of another entry point (e.g. an API
  // handler reached from a UI entry point) shouldn't also seed its own,
  // mostly-redundant flow — prefer true zero-incoming-edge starting points
  // when any exist.
  const trueEntryPoints = roleCandidates.filter(
    (node) => (inDegree.get(node.id) ?? 0) === 0,
  );
  const entryPoints = (
    trueEntryPoints.length ? trueEntryPoints : roleCandidates
  ).sort(
    (a, b) =>
      (inDegree.get(a.id) ?? 0) - (inDegree.get(b.id) ?? 0) ||
      b.confidence - a.confidence,
  );

  function walk(startId: string): {
    startId: string;
    nodeIds: string[];
    edgeIds: string[];
  } {
    const nodeIds = new Set<string>([startId]);
    const edgeIds = new Set<string>();
    let frontier = [startId];
    for (let hop = 0; hop < maxHops && nodeIds.size < maxNodesPerFlow; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const edge of outgoing.get(id) ?? []) {
          if (nodeIds.size >= maxNodesPerFlow) break;
          edgeIds.add(edge.id);
          if (!nodeIds.has(edge.target)) {
            nodeIds.add(edge.target);
            next.push(edge.target);
          }
        }
      }
      if (!next.length) break;
      frontier = next;
    }
    return { startId, nodeIds: [...nodeIds], edgeIds: [...edgeIds] };
  }

  const candidates = entryPoints
    .map((node) => walk(node.id))
    .filter((flow) => flow.nodeIds.length >= 2);

  // Drop near-duplicate flows (e.g. several entry points funneling into the
  // same backend chain) — compare what happens AFTER each flow's own start
  // node (which always differs by construction), keep the larger/more
  // complete flow when that downstream shape overlaps heavily.
  const downstream = (flow: { startId: string; nodeIds: string[] }) =>
    new Set(flow.nodeIds.filter((id) => id !== flow.startId));
  const deduped: { startId: string; nodeIds: string[]; edgeIds: string[] }[] =
    [];
  for (const flow of candidates) {
    const set = downstream(flow);
    const overlapping = deduped.find(
      (existing) => jaccard(set, downstream(existing)) > 0.7,
    );
    if (!overlapping) deduped.push(flow);
    else if (flow.nodeIds.length > overlapping.nodeIds.length)
      deduped[deduped.indexOf(overlapping)] = flow;
  }

  return deduped
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length)
    .slice(0, maxFlows)
    .map((flow, index) => ({
      id: `flow-${index}`,
      nodeIds: flow.nodeIds,
      edgeIds: flow.edgeIds,
    }));
}
