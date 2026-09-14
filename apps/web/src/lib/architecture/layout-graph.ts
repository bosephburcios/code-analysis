import type { ArchitectureNode, ArchitectureEdge } from './types.ts';
import type ElkConstructor from 'elkjs/lib/elk-api.js';
import type { ElkNode, ElkExtendedEdge, LayoutOptions } from 'elkjs/lib/elk-api.js';

export type LayoutGroup = {
  id: string; category: string; label: string;
  width: number; height: number; position: { x: number; y: number };
  members: { node: ArchitectureNode; position: { x: number; y: number }; groupId?: string }[];
  subGroups?: { id: string; label: string; width: number; height: number; position: { x: number; y: number } }[];
};
// Canvas-absolute — resolved once in layoutArchitecture, unlike LayoutGroup's
// group-relative positions, so consumers never need to redo offset math.
export type EdgeRoute = { points: { x: number; y: number }[] };
export type LayoutResult = LayoutGroup[] & { edgeRoutes: Map<string, EdgeRoute> };
// group-relative (or subgroup-relative, when groupId is set) — mirrors how
// member node positions already work, resolved to absolute in layoutArchitecture.
type RawEdgeRoute = { id: string; points: { x: number; y: number }[]; groupId?: string };

const sections = [
  { id: 'frontend', label: 'Frontend' },
  { id: 'backend', label: 'Backend API & services' },
  { id: 'data', label: 'Data stores' },
  { id: 'external', label: 'External services' },
  { id: 'infra', label: 'Infrastructure & configuration' },
] as const;

// A node's raw type ('frontend'/'api'/'service'/'database'/'external'/'infra')
// isn't quite enough on its own: a "data_access" role (a thin database/ORM
// client wrapper, e.g. a "Prisma" node) belongs with the store it wraps, not
// as a business feature. Prefer the AI-assigned role when present; for graphs
// generated before that field existed, fall back to the same label-matches-
// its-own-technology heuristic used previously. Everything else backend-ish
// stays one section, internally sub-grouped by nearest API anchor (see
// clusterByApiAnchor).
function classifySection(node: ArchitectureNode): string {
  if (node.type === 'frontend') return 'frontend';
  if (node.type === 'external') return 'external';
  if (node.type === 'infra') return 'infra';
  if (node.type === 'database') return 'data';
  const role = typeof node.metadata?.role === 'string' ? node.metadata.role : undefined;
  if (role) return role === 'data_access' ? 'data' : 'backend';
  const technologies = Array.isArray(node.metadata?.technologies) ? node.metadata.technologies as string[] : [];
  if (technologies.some(tech => tech.toLowerCase() === node.label.toLowerCase())) return 'data';
  return 'backend';
}

const NODE_WIDTH = 208; // kept in lockstep with architecture-canvas.tsx's w-[208px] and style width: 208
const NODE_HEIGHT = 118;

// Left-to-right layered layout with crossing minimization, replacing the old
// alphabetical grid. Ports are pinned WEST(in)/EAST(out) to match the fixed
// Handle positions already rendered on every node, which is what forces the
// strict left-in/right-out pipeline shape instead of letting ELK pick facing
// freely. Orthogonal routing (even though we discard ELK's own bendpoints —
// React Flow's smoothstep renderer draws the actual edge path) still changes
// node placement, since crossing minimization considers routing style.
const elkOptions: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '56',
  'elk.layered.spacing.nodeNodeBetweenLayers': '96',
  'elk.spacing.edgeNode': '32',
  'elk.spacing.edgeEdge': '16',
  'elk.padding': '[top=64,left=24,bottom=24,right=24]',
  'elk.portConstraints': 'FIXED_SIDE',
  // Edges sharing a target converge onto identical bend-point coordinates
  // before branching — verified live, gives real "shared trunk" bundling for
  // free, no hand-built bus-routing logic needed.
  'elk.layered.mergeEdges': 'true',
  // Respects the order members are passed in (see barycenterOrder below)
  // instead of picking its own — verified live.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};
const subGroupOptions: LayoutOptions = { ...elkOptions, 'elk.spacing.nodeNode': '72', 'elk.padding': '[top=40,left=20,bottom=20,right=20]' };
// Row-to-row spacing for the outer backend graph — extra room around the
// unrouted cross-cluster edges (e.g. multiple rows separately checking Auth
// API) that fall back to plain smoothstep, since they don't get ELK's own
// bundling/orthogonal routing (see layoutBackend).
const backendRowOptions: LayoutOptions = { ...elkOptions, 'elk.spacing.nodeNode': '64' };
function toElkNode(node: ArchitectureNode): ElkNode {
  return {
    id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT,
    ports: [
      { id: `${node.id}#in`, layoutOptions: { 'elk.port.side': 'WEST' } },
      { id: `${node.id}#out`, layoutOptions: { 'elk.port.side': 'EAST' } },
    ],
  };
}
function toElkEdge(edge: ArchitectureEdge): ElkExtendedEdge {
  return { id: edge.id, sources: [`${edge.source}#out`], targets: [`${edge.target}#in`] };
}
function collectRoutes(edges: ElkExtendedEdge[] | undefined, groupId?: string): RawEdgeRoute[] {
  return (edges ?? []).flatMap(edge => {
    const section = edge.sections?.[0];
    if (!section) return [];
    return [{ id: edge.id!, points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint], groupId }];
  });
}

async function layoutFlat(elk: InstanceType<typeof ElkConstructor>, id: string, members: ArchitectureNode[], edges: ArchitectureEdge[], options: LayoutOptions = elkOptions) {
  const ids = new Set(members.map(member => member.id));
  const graph: ElkNode = {
    id, layoutOptions: options,
    children: members.map(toElkNode),
    // "imports component" is the exact fallback label for a plain structural
    // import with no detected function call (build-responsibilities.ts) —
    // already treated as lower-signal elsewhere (responsibility-slots.ts's
    // fanout calculation). Excluding it from layout too keeps components
    // that merely share a UI import (e.g. a nav/layout component) from
    // distorting node order within a section.
    edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && edge.label !== 'imports component').map(toElkEdge),
  };
  const result = await elk.layout(graph);
  const byId = new Map(members.map(member => [member.id, member]));
  return {
    width: result.width ?? 0, height: result.height ?? 0,
    members: (result.children ?? []).map(child => ({ node: byId.get(child.id)!, position: { x: child.x ?? 0, y: child.y ?? 0 } })),
    subGroups: undefined as LayoutGroup['subGroups'],
    edgeRoutes: collectRoutes(result.edges),
  };
}

// Clusters backend members by nearest "*API"-labeled anchor — a simultaneous
// multi-source BFS over backend-internal edges, seeded from every node whose
// label contains "API" at once. Distance-based proximity (not raw
// reachability, which collapses everything into one blob when the graph is
// densely connected, and not "smallest frontend flow," which names groups
// after frontend pages instead of the backend entry point that owns them)
// — verified live: this cleanly separates e.g. Analysis API + Repository
// Analysis + Build Graph from Auth API, which nothing points behind.
// Prefers the AI-assigned role when present; falls back to the label regex
// for graphs generated before that field existed.
function isApiNode(node: ArchitectureNode): boolean {
  const role = typeof node.metadata?.role === 'string' ? node.metadata.role : undefined;
  return role ? role === 'api' : /\bapi\b/i.test(node.label);
}

function clusterByApiAnchor(members: ArchitectureNode[], edges: ArchitectureEdge[]): ArchitectureNode[][] {
  const ids = new Set(members.map(member => member.id));
  const anchors = members.filter(isApiNode);
  if (!anchors.length) return [];
  const forward = new Map<string, string[]>();
  for (const edge of edges) if (ids.has(edge.source) && ids.has(edge.target)) {
    const list = forward.get(edge.source) ?? []; list.push(edge.target); forward.set(edge.source, list);
  }
  const owner = new Map<string, string>();
  const queue: string[] = [];
  for (const anchor of anchors) { owner.set(anchor.id, anchor.id); queue.push(anchor.id); }
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of forward.get(current) ?? []) {
      if (!owner.has(next)) { owner.set(next, owner.get(current)!); queue.push(next); }
    }
  }
  const byAnchor = new Map<string, ArchitectureNode[]>();
  const other: ArchitectureNode[] = [];
  for (const member of members) {
    const anchorId = owner.get(member.id);
    if (!anchorId) { other.push(member); continue; }
    const list = byAnchor.get(anchorId) ?? []; list.push(member); byAnchor.set(anchorId, list);
  }
  const groups = anchors.map(anchor => byAnchor.get(anchor.id)).filter((group): group is ArchitectureNode[] => Boolean(group));
  return other.length ? [...groups, other] : groups;
}

async function layoutBackend(elk: InstanceType<typeof ElkConstructor>, members: ArchitectureNode[], edges: ArchitectureEdge[]) {
  const clusters = clusterByApiAnchor(members, edges);
  // No API-labeled anchors, or nothing usefully separated, or an implausible
  // number of groups — fall back to one flat box.
  if (clusters.length <= 1 || clusters.length > 8) return layoutFlat(elk, 'backend', members, edges);

  const clusterEdges = clusters.map(group => {
    const groupIds = new Set(group.map(node => node.id));
    return edges.filter(edge => groupIds.has(edge.source) && groupIds.has(edge.target) && edge.label !== 'imports component').map(toElkEdge);
  });
  // Measure each cluster's natural height independently first, so every row
  // can be padded to the tallest one — a uneven 1/1/2/3-node skyline reads as
  // messy and doesn't export cleanly, which is the whole point of grouping.
  const probes = await Promise.all(clusters.map((group, index) => {
    const probeGraph: ElkNode = { id: `probe-${index}`, layoutOptions: subGroupOptions, children: group.map(toElkNode), edges: clusterEdges[index] };
    return elk.layout(probeGraph);
  }));
  const maxHeight = Math.max(...probes.map(probe => probe.height ?? 0));

  const graph: ElkNode = {
    id: 'backend', layoutOptions: backendRowOptions,
    children: clusters.map((group, index) => {
      const shortfall = Math.max(0, maxHeight - (probes[index].height ?? 0));
      return {
        id: `backend-group:${index}`,
        layoutOptions: { ...subGroupOptions, 'elk.padding': `[top=40,left=20,bottom=${20 + shortfall},right=20]` },
        children: group.map(toElkNode),
        edges: clusterEdges[index],
      };
    }),
    // Deliberately empty: clusters are not edge-disjoint (e.g. both Analysis
    // API and Semantic API separately check Auth API), so declaring
    // cross-cluster edges here would let ELK's layering pull clusters into
    // side-by-side columns by dependency order instead of stacking them as
    // rows — verified live. Those edges fall back to plain smoothstep
    // rendering in architecture-canvas.tsx instead.
    edges: [],
  };
  const result = await elk.layout(graph);
  const byId = new Map(members.map(member => [member.id, member]));
  const subGroups: NonNullable<LayoutGroup['subGroups']> = [];
  const groupMembers: LayoutGroup['members'] = [];
  const edgeRoutes: RawEdgeRoute[] = collectRoutes(result.edges);
  (result.children ?? []).forEach((child, index) => {
    const anchorLabel = clusters[index].find(isApiNode)?.label ?? clusters[index][0].label;
    subGroups.push({ id: child.id, label: anchorLabel, width: child.width ?? 0, height: child.height ?? 0, position: { x: child.x ?? 0, y: child.y ?? 0 } });
    for (const grandchild of child.children ?? []) {
      groupMembers.push({ node: byId.get(grandchild.id)!, position: { x: grandchild.x ?? 0, y: grandchild.y ?? 0 }, groupId: child.id });
    }
    edgeRoutes.push(...collectRoutes(child.edges, child.id));
  });
  return { width: result.width ?? 0, height: result.height ?? 0, members: groupMembers, subGroups, edgeRoutes };
}

// Cross-section edges (e.g. frontend→backend) never go through ELK — the
// two-tier design runs ELK once per section so section placement stays
// hand-rolled and guaranteed left-to-right. For any edge whose source
// section sits strictly left of its target section, route a 4-point elbow
// through a shared lane in the gap between them: all edges between the same
// pair of sections converge on one lane-x, producing the "one lane between
// groups" look without any per-edge offset — each edge still verticals off
// independently to its own target's y once past the shared corridor.
function routeCrossSectionEdges(groups: LayoutGroup[], edges: ArchitectureEdge[], nodeAbs: Map<string, { x: number; y: number }>) {
  const sectionOf = new Map(groups.flatMap(group => group.members.map(member => [member.node.id, group] as const)));
  const laneX = new Map<string, number>();
  const routes = new Map<string, EdgeRoute>();
  for (const edge of edges) {
    const from = sectionOf.get(edge.source);
    const to = sectionOf.get(edge.target);
    if (!from || !to || from.id === to.id) continue;
    const gapStart = from.position.x + from.width;
    if (gapStart > to.position.x) continue; // not horizontally left-of-right (e.g. backend→infra, stacked below)
    const sourcePos = nodeAbs.get(edge.source);
    const targetPos = nodeAbs.get(edge.target);
    if (!sourcePos || !targetPos) continue;
    const key = `${from.id}->${to.id}`;
    let x = laneX.get(key);
    if (x === undefined) {
      x = gapStart + (to.position.x - gapStart) / 2;
      laneX.set(key, x);
    }
    const sourceEast = { x: sourcePos.x + NODE_WIDTH, y: sourcePos.y + NODE_HEIGHT / 2 };
    const targetWest = { x: targetPos.x, y: targetPos.y + NODE_HEIGHT / 2 };
    // If another member of the target section sits between the lane and the
    // target (e.g. two data-store nodes side by side, target is the second),
    // a straight final approach would cut through that sibling's box —
    // detour over the top of the whole section instead, which stays clear
    // regardless of how many nodes are in the way.
    const blocked = to.members.some(member => {
      if (member.node.id === edge.target) return false;
      const pos = nodeAbs.get(member.node.id);
      return pos && pos.x < targetPos.x && Math.abs(pos.y + NODE_HEIGHT / 2 - targetWest.y) < NODE_HEIGHT;
    });
    const points = blocked
      ? [sourceEast, { x, y: sourceEast.y }, { x, y: to.position.y - 20 }, { x: targetWest.x, y: to.position.y - 20 }, targetWest]
      : [sourceEast, { x, y: sourceEast.y }, { x, y: targetWest.y }, targetWest];
    routes.set(edge.id, { points });
  }
  return routes;
}

// Orders a section's members by the average relative y of whichever
// already-positioned upstream nodes call them — the standard barycenter
// heuristic from layered graph drawing, applied across independent
// per-section ELK calls (a single global ELK call was ruled out earlier
// since it would let ELK reorder the sections themselves). A member with no
// positioned caller yet sinks to the end, stably.
function barycenterOrder(members: ArchitectureNode[], edges: ArchitectureEdge[], positionedY: Map<string, number>): ArchitectureNode[] {
  const score = (id: string) => {
    const ys = edges.filter(edge => edge.target === id && positionedY.has(edge.source)).map(edge => positionedY.get(edge.source)!);
    return ys.length ? ys.reduce((sum, y) => sum + y, 0) / ys.length : Number.MAX_SAFE_INTEGER;
  };
  return [...members].sort((a, b) => score(a.id) - score(b.id) || a.id.localeCompare(b.id));
}

export async function layoutArchitecture(nodes: ArchitectureNode[], edges: ArchitectureEdge[] = []): Promise<LayoutResult> {
  if (!nodes.length) return [] as unknown as LayoutResult;
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();

  const groups: LayoutGroup[] = [];
  const rawRoutes: { group: LayoutGroup; routes: RawEdgeRoute[] }[] = [];
  const positionedY = new Map<string, number>();
  for (const section of sections) {
    const unordered = nodes.filter(node => classifySection(node) === section.id).sort((a, b) => a.id.localeCompare(b.id));
    if (!unordered.length) continue;
    const members = barycenterOrder(unordered, edges, positionedY);
    const laidOut = section.id === 'backend' ? await layoutBackend(elk, members, edges) : await layoutFlat(elk, section.id, members, edges);
    for (const member of laidOut.members) positionedY.set(member.node.id, member.position.y);
    const group: LayoutGroup = {
      id: `boundary:${section.id}`, category: section.id, label: section.label,
      width: laidOut.width, height: laidOut.height, position: { x: 0, y: 0 },
      members: laidOut.members, subGroups: laidOut.subGroups,
    };
    groups.push(group);
    rawRoutes.push({ group, routes: laidOut.edgeRoutes });
  }

  const get = (id: string) => groups.find(group => group.category === id);
  const front = get('frontend'); const back = get('backend'); const data = get('data'); const external = get('external'); const infra = get('infra');
  const middleX = front ? front.width + 150 : 0;
  const rightX = middleX + Math.max(back?.width ?? 0, infra?.width ?? 0) + (back || infra ? 170 : 0);
  if (front) front.position = { x: 0, y: 140 };
  if (back) back.position = { x: middleX, y: 140 };
  if (data) data.position = { x: rightX, y: 140 };
  if (external) external.position = { x: rightX, y: data ? data.height + 250 : 140 };
  if (infra) infra.position = { x: middleX, y: back ? back.height + 290 : 140 };

  const nodeAbs = new Map<string, { x: number; y: number }>();
  for (const group of groups) for (const member of group.members) {
    const subGroup = member.groupId ? group.subGroups?.find(sub => sub.id === member.groupId) : undefined;
    nodeAbs.set(member.node.id, {
      x: group.position.x + (subGroup?.position.x ?? 0) + member.position.x,
      y: group.position.y + (subGroup?.position.y ?? 0) + member.position.y,
    });
  }

  const edgeRoutes = new Map<string, EdgeRoute>();
  for (const { group, routes } of rawRoutes) {
    for (const route of routes) {
      const subGroup = route.groupId ? group.subGroups?.find(sub => sub.id === route.groupId) : undefined;
      const dx = group.position.x + (subGroup?.position.x ?? 0);
      const dy = group.position.y + (subGroup?.position.y ?? 0);
      edgeRoutes.set(route.id, { points: route.points.map(point => ({ x: point.x + dx, y: point.y + dy })) });
    }
  }
  for (const [id, route] of routeCrossSectionEdges(groups, edges, nodeAbs)) edgeRoutes.set(id, route);

  return Object.assign(groups, { edgeRoutes }) as LayoutResult;
}
