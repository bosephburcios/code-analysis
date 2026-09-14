"use client";

import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  Background,
  Controls,
  ControlButton,
  ReactFlow,
  Position,
  MarkerType,
  Handle,
  Panel,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import {
  Monitor,
  Server,
  Database,
  Cloud,
  Settings2,
  Boxes,
  ArrowRight,
  Loader2,
  Plus,
  Minus,
  Maximize,
} from "lucide-react";
import type {
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode,
} from "@/lib/architecture/types";
import { layoutArchitecture, type LayoutGroup, type LayoutResult } from "@/lib/architecture/layout-graph";
import { RouteEdgeComponent, type RouteEdge } from "./route-edge";
import "@xyflow/react/dist/style.css";

const icons = {
  frontend: Monitor,
  api: Server,
  service: Boxes,
  database: Database,
  external: Cloud,
  infra: Settings2,
};
const colors = {
  frontend: "var(--arch-color-frontend)",
  api: "var(--arch-color-api)",
  service: "var(--arch-color-service)",
  database: "var(--arch-color-database)",
  external: "var(--arch-color-external)",
  infra: "var(--arch-color-infra)",
};
// Top-level section boundaries get a distinct tint per category, reusing the
// same per-type colors already used for node icons above — nested sub-group
// boxes (Backend's internal rows) stay untinted/neutral so the strong color
// signal reads at the section level, not on every nested box.
const boundaryColors: Record<string, string> = {
  frontend: "var(--arch-color-frontend)",
  backend: "var(--arch-color-api)",
  data: "var(--arch-color-database)",
  external: "var(--arch-color-external)",
  infra: "var(--arch-color-infra)",
};
type ComponentNode = Node<
  { component: ArchitectureNode; dimmed?: boolean; selected?: boolean; readable?: boolean; onInspect?: (id: string) => void },
  "component"
>;
type BoundaryNode = Node<{ label: string; count: number; category?: string }, "boundary">;

function Component({ data }: NodeProps<ComponentNode>) {
  const node = data.component;
  const Icon = icons[node.type];
  const technologies = node.metadata?.technologies;
  return (
    <div
      role={data.onInspect ? "button" : undefined}
      tabIndex={data.onInspect ? 0 : undefined}
      aria-label={data.onInspect ? `Inspect ${node.label}` : undefined}
      aria-pressed={data.onInspect ? !!data.selected : undefined}
      onKeyDown={(event) => {
        if (data.onInspect && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          data.onInspect(node.id);
        }
      }}
      // width kept in lockstep with NODE_WIDTH in layout-graph.ts and the
      // ComponentNode style width literal below.
      className={`flex h-[118px] w-[208px] flex-col items-center justify-center rounded-lg border px-3 text-center shadow-sm transition-opacity ${
        data.selected
          ? "border-[var(--arch-node-selected-ring)] ring-2 ring-[var(--arch-node-selected-ring)]"
          : "border-[var(--arch-node-border)]"
      } bg-[var(--arch-node-bg)]`}
      style={{ opacity: data.dimmed ? 0.25 : 1, cursor: "pointer" }}
      title={`${node.label}\n${node.path ?? ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1 !w-1 !border-0 !bg-[var(--arch-handle)]"
      />
      <Icon
        size={30}
        strokeWidth={1.3}
        color={colors[node.type]}
        aria-hidden="true"
      />
      <p className={`mt-2 line-clamp-2 font-medium leading-4 text-[var(--arch-node-text)] ${data.readable ? "text-[14px]" : "text-[12px]"}`}>
        {node.label}
      </p>
      <p className={`mt-1 w-full truncate font-mono text-[var(--arch-node-subtext)] ${data.readable ? "text-[10px]" : "text-[9px]"}`} title={Array.isArray(technologies) ? technologies.join(" · ") : undefined}>
        {Array.isArray(technologies) ? technologies.join(" · ") : (node.path ?? node.type)}
      </p>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1 !w-1 !border-0 !bg-[var(--arch-handle)]"
      />
    </div>
  );
}
function Boundary({ data }: NodeProps<BoundaryNode>) {
  // Same alpha intensity the shared amber default already used (55%/8%),
  // just per-category hue via color-mix() instead of one fixed color.
  const tint = data.category ? boundaryColors[data.category] : undefined;
  const style = tint ? {
    borderColor: `color-mix(in srgb, ${tint} 55%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${tint} 8%, transparent)`,
    boxShadow: `inset 0 0 0 3px color-mix(in srgb, ${tint} 8%, transparent)`,
  } : undefined;
  return (
    <div
      className={tint ? "h-full w-full rounded-xl border" : "h-full w-full rounded-xl border border-[var(--arch-boundary-border)] bg-[var(--arch-boundary-bg)] shadow-[inset_0_0_0_3px_var(--arch-boundary-bg)]"}
      style={style}
    >
      <div className="m-3 inline-flex max-w-[calc(100%-24px)] items-center gap-3 border border-[var(--arch-boundary-label-border)] bg-[var(--arch-boundary-label-bg)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--arch-boundary-label-text)]">
        <span>{data.label}</span>
        <span className="text-[var(--arch-boundary-count-text)]">{data.count}</span>
      </div>
    </div>
  );
}
const nodeTypes = { component: Component, boundary: Boundary };
const edgeTypes = { route: RouteEdgeComponent };

const ZOOM_TRANSITION_MS = 250;

// React Flow's built-in <Controls> zoom buttons call zoomIn()/zoomOut() with
// no duration, which jumps instantly instead of animating — replace them
// with custom buttons (same icons/order: zoom in, zoom out, fit view) that
// pass a duration for a smooth transition.
function SmoothZoomControls({ fitViewOptions }: { fitViewOptions: { padding: number; maxZoom: number } }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <>
      <ControlButton onClick={() => void zoomIn({ duration: ZOOM_TRANSITION_MS })} title="zoom in" aria-label="zoom in">
        <Plus size={16} />
      </ControlButton>
      <ControlButton onClick={() => void zoomOut({ duration: ZOOM_TRANSITION_MS })} title="zoom out" aria-label="zoom out">
        <Minus size={16} />
      </ControlButton>
      <ControlButton onClick={() => void fitView({ ...fitViewOptions, duration: ZOOM_TRANSITION_MS })} title="fit view" aria-label="fit view">
        <Maximize size={16} />
      </ControlButton>
    </>
  );
}

function LayoutLoader({ graphNodes, graphEdges, layout, onData, onError }: {
  graphNodes: ArchitectureNode[]; graphEdges: ArchitectureEdge[];
  layout: (nodes: ArchitectureNode[], edges: ArchitectureEdge[]) => LayoutGroup[] | Promise<LayoutGroup[]>;
  onData: (groups: LayoutGroup[]) => void; onError: () => void;
}) {
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(layout(graphNodes, graphEdges))
      .then((result) => { if (!cancelled) onData(result); })
      .catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; };
  }, [graphNodes, graphEdges, layout, onData, onError]);
  return null;
}

export const ArchitectureCanvas = forwardRef<HTMLDivElement, ArchitectureGraph & {
  layout?: (nodes: ArchitectureNode[], edges: ArchitectureEdge[]) => LayoutGroup[] | Promise<LayoutGroup[]>;
  onNodeClick?: (id: string) => void;
  selectedId?: string | null;
  highlightedIds?: Set<string> | null;
  title?: string;
  subtitle?: string;
  inspectable?: boolean;
  // Renders a clean, static-image-friendly variant for the README export
  // path: no header bar, no zoom/fit controls, no legend, larger labels,
  // more generous fit padding. Same node/edge styling and dark theme
  // otherwise — this is a rendering mode, not a different visual identity.
  exportMode?: boolean;
  onExportReady?: () => void;
}>(function ArchitectureCanvas({
  nodes: graphNodes,
  edges: graphEdges,
  layout = layoutArchitecture,
  onNodeClick,
  selectedId = null,
  highlightedIds = null,
  title = "System architecture",
  subtitle = "Grouped by responsibility · relationships inferred from files",
  inspectable = false,
  exportMode = false,
  onExportReady,
}, ref) {
  const [activeEdge, setActiveEdge] = useState<string | null>(null);

  // Structural layout only recomputes when the graph itself changes — never
  // on selection/highlight/hover — so dimming a node stays an instant style
  // update on already-positioned nodes instead of re-running layout. The old
  // graph stays visible while a new one lays out, rather than flashing empty.
  const [groups, setGroups] = useState<LayoutGroup[] | null>(null);
  const [layoutFailed, setLayoutFailed] = useState(false);
  const onLayoutData = useCallback((result: LayoutGroup[]) => { setGroups(result); setLayoutFailed(false); }, []);
  const onLayoutError = useCallback(() => { setLayoutFailed(true); }, []);

  const { nodes, edges } = useMemo(() => {
    if (!groups) return { nodes: [], edges: [] };
    // layoutModules (Dependencies tab) returns plain LayoutGroup[] with no
    // edgeRoutes; only layoutArchitecture's ELK-backed result carries one.
    const edgeRoutes = "edgeRoutes" in groups ? (groups as LayoutResult).edgeRoutes : undefined;
    const parents: BoundaryNode[] = groups.map((group) => ({
      id: group.id,
      type: "boundary",
      position: group.position,
      data: { label: group.label, count: group.members.length, category: group.category },
      style: { width: group.width, height: group.height },
      selectable: false,
      zIndex: 0,
    }));
    const subParents: BoundaryNode[] = groups.flatMap((group) =>
      (group.subGroups ?? []).map((subGroup) => ({
        id: subGroup.id,
        type: "boundary",
        parentId: group.id,
        extent: "parent" as const,
        position: subGroup.position,
        data: {
          label: subGroup.label,
          count: group.members.filter((member) => member.groupId === subGroup.id).length,
        },
        style: { width: subGroup.width, height: subGroup.height },
        selectable: false,
        zIndex: 1,
      })),
    );
    const children: ComponentNode[] = groups.flatMap((group) =>
      group.members.map(({ node, position, groupId }) => ({
        id: node.id,
        type: "component" as const,
        parentId: groupId ?? group.id,
        extent: "parent" as const,
        position,
        data: {
          component: node,
          dimmed: highlightedIds ? !highlightedIds.has(node.id) : false,
          selected: node.id === selectedId,
          readable: inspectable || exportMode,
          onInspect: onNodeClick,
        },
        style: { width: 208, height: 118 }, // kept in lockstep with NODE_WIDTH in layout-graph.ts
        zIndex: 2,
      })),
    );
    const known = new Set(graphNodes.map((node) => node.id));
    const edges: (Edge | RouteEdge)[] = graphEdges
      .filter((edge) => known.has(edge.source) && known.has(edge.target))
      .map((edge) => {
        const dimmed = highlightedIds
          ? !highlightedIds.has(edge.source) || !highlightedIds.has(edge.target)
          : false;
        const route = edgeRoutes?.get(edge.id);
        // Edges with no computed route (cross-cluster-within-backend edges,
        // e.g. several rows separately checking Auth API) fall back to a
        // plain unrouted smoothstep — visually louder than the clean
        // ELK-routed chains since they aren't bundled/orthogonal. Receding
        // them by default (same treatment as async) keeps the primary,
        // cleanly-routed story legible; hovering/selecting still reveals them.
        const baseline = !route ? 0.2 : edge.kind === "async" ? 0.35 : 1;
        const opacity = highlightedIds ? (dimmed ? 0.15 : 1) : baseline;
        return {
          ...edge,
          label: inspectable && edge.id !== activeEdge ? undefined : edge.label,
          ariaLabel: edge.label ?? `${edge.source} to ${edge.target}`,
          type: route ? "route" : "smoothstep",
          data: route ? { points: route.points } : undefined,
          zIndex: edge.id === activeEdge ? 3 : 1,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color:
              edge.kind === "data"
                ? "var(--arch-edge-data)"
                : "var(--arch-edge-default)",
            width: 16,
            height: 16,
          },
          style: {
            stroke:
              edge.kind === "data"
                ? "var(--arch-edge-data)"
                : "var(--arch-edge-default)",
            strokeWidth: 1.3,
            strokeDasharray: edge.kind === "async" ? "7 6" : undefined,
            opacity,
          },
          labelStyle: { fontSize: 10, fill: "var(--arch-edge-label-text)" },
          labelBgStyle: { fill: "var(--arch-edge-label-bg)", fillOpacity: 0.95 },
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 3,
          pathOptions: { borderRadius: 18, offset: 35 },
        };
      });
    return { nodes: [...parents, ...subParents, ...children], edges };
  }, [groups, graphNodes, graphEdges, highlightedIds, selectedId, inspectable, exportMode, activeEdge, onNodeClick]);
  const { resolvedTheme } = useTheme();
  const fitViewOptions = { padding: exportMode ? 0.1 : inspectable ? 0.06 : 0.16, maxZoom: exportMode ? 1 : inspectable ? 1.15 : 1 };

  // Fires once layout has settled and ReactFlow's own fitView has had two
  // frames to apply — the standard "wait before capturing" pattern for
  // rasterizing a React Flow canvas (see xyflow's own image-export docs).
  useEffect(() => {
    if (!exportMode || !groups || !onExportReady) return;
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => onExportReady()); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [exportMode, groups, onExportReady]);

  if (!graphNodes.length)
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No supported app boundaries detected. The repository overview is
        available below.
      </div>
    );
  return (
    <div ref={ref} className="relative overflow-hidden rounded-xl border border-[var(--arch-canvas-border)] bg-[var(--arch-canvas-bg)]">
      <LayoutLoader graphNodes={graphNodes} graphEdges={graphEdges} layout={layout} onData={onLayoutData} onError={onLayoutError} />
      {!exportMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--arch-header-border)] px-4 py-3 text-[11px] text-[var(--arch-header-text)]">
          <span className="font-mono uppercase tracking-widest">{title}</span>
          <span>{subtitle}</span>
        </div>
      )}
      <div
        className={exportMode ? "h-[900px] w-[1400px]" : "h-[520px] w-full lg:h-[680px]"}
        aria-label="Grouped system architecture diagram"
      >
        {layoutFailed ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Could not compute a layout for this graph.
          </div>
        ) : !groups ? (
          <div role="status" className="flex h-full items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            Laying out the graph…
          </div>
        ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={resolvedTheme === "light" ? "light" : "dark"}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.02}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          nodesFocusable={false}
          onEdgeMouseEnter={(_, edge) => setActiveEdge(edge.id)}
          onEdgeMouseLeave={() => setActiveEdge(null)}
          onEdgeClick={(_, edge) => setActiveEdge(edge.id)}
          onPaneClick={() => setActiveEdge(null)}
          onNodeClick={(_, node) =>
            node.type === "component" && onNodeClick?.(node.id)
          }
        >
          <Background color="var(--arch-grid)" gap={32} size={0.6} />
          {!exportMode && (
            <Controls showZoom={false} showFitView={false} showInteractive={false}>
              <SmoothZoomControls fitViewOptions={fitViewOptions} />
            </Controls>
          )}
          {!exportMode && (
            <Panel position="top-right">
              <div className="space-y-2 rounded-md border border-[var(--arch-panel-border)] bg-[var(--arch-panel-bg)] px-3 py-2 text-[10px] text-[var(--arch-panel-text)]">
                <div className="flex items-center gap-2">
                  <ArrowRight size={18} /> Request / dependency
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight size={18} className="text-[var(--arch-edge-data)]" />{" "}
                  Data access
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-[18px] border-t border-dashed" />{" "}
                  Asynchronous
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>
        )}
      </div>
    </div>
  );
});
