"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import {
  Background,
  Controls,
  ReactFlow,
  Position,
  MarkerType,
  Handle,
  Panel,
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
} from "lucide-react";
import type {
  ArchitectureGraph,
  ArchitectureNode,
} from "@/lib/architecture/types";
import { layoutArchitecture } from "@/lib/architecture/layout-graph";
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
type ComponentNode = Node<{ component: ArchitectureNode }, "component">;
type BoundaryNode = Node<{ label: string; count: number }, "boundary">;

function Component({ data }: NodeProps<ComponentNode>) {
  const node = data.component;
  const Icon = icons[node.type];
  const confidence = node.metadata?.confidence;
  return (
    <div
      className="flex h-[118px] w-[176px] flex-col items-center justify-center rounded-lg border border-[var(--arch-node-border)] bg-[var(--arch-node-bg)] px-3 text-center shadow-sm"
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
      <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-4 text-[var(--arch-node-text)]">
        {node.label}
      </p>
      <p className="mt-1 w-full truncate font-mono text-[9px] text-[var(--arch-node-subtext)]">
        {typeof confidence === "number"
          ? `${confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Moderate" : "Low"} confidence · ${Math.round(confidence * 100)}%`
          : (node.path ?? node.type)}
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
  return (
    <div className="h-full w-full rounded-xl border border-[var(--arch-boundary-border)] bg-[var(--arch-boundary-bg)] shadow-[inset_0_0_0_3px_var(--arch-boundary-bg)]">
      <div className="m-3 inline-flex max-w-[calc(100%-24px)] items-center gap-3 border border-[var(--arch-boundary-label-border)] bg-[var(--arch-boundary-label-bg)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--arch-boundary-label-text)]">
        <span>{data.label}</span>
        <span className="text-[var(--arch-boundary-count-text)]">{data.count}</span>
      </div>
    </div>
  );
}
const nodeTypes = { component: Component, boundary: Boundary };

export function ArchitectureCanvas({
  nodes: graphNodes,
  edges: graphEdges,
}: ArchitectureGraph) {
  const { nodes, edges } = useMemo(() => {
    const groups = layoutArchitecture(graphNodes);
    const parents: BoundaryNode[] = groups.map((group) => ({
      id: group.id,
      type: "boundary",
      position: group.position,
      data: { label: group.label, count: group.members.length },
      style: { width: group.width, height: group.height },
      selectable: false,
      zIndex: 0,
    }));
    const children: ComponentNode[] = groups.flatMap((group) =>
      group.members.map(({ node, position }) => ({
        id: node.id,
        type: "component" as const,
        parentId: group.id,
        extent: "parent" as const,
        position,
        data: { component: node },
        style: { width: 176, height: 118 },
        zIndex: 2,
      })),
    );
    const known = new Set(graphNodes.map((node) => node.id));
    const edges: Edge[] = graphEdges
      .filter((edge) => known.has(edge.source) && known.has(edge.target))
      .map((edge) => ({
        ...edge,
        type: "smoothstep",
        zIndex: 1,
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
        },
        labelStyle: { fontSize: 10, fill: "var(--arch-edge-label-text)" },
        labelBgStyle: { fill: "var(--arch-edge-label-bg)", fillOpacity: 0.95 },
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 3,
        pathOptions: { borderRadius: 18, offset: 35 },
      }));
    return { nodes: [...parents, ...children], edges };
  }, [graphNodes, graphEdges]);
  const { resolvedTheme } = useTheme();

  if (!graphNodes.length)
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No supported app boundaries detected. The repository overview is
        available below.
      </div>
    );
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--arch-canvas-border)] bg-[var(--arch-canvas-bg)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--arch-header-border)] px-4 py-3 text-[11px] text-[var(--arch-header-text)]">
        <span className="font-mono uppercase tracking-widest">
          System architecture
        </span>
        <span>
          Grouped by responsibility · relationships inferred from files
        </span>
      </div>
      <div
        className="h-[520px] w-full lg:h-[680px]"
        aria-label="Grouped system architecture diagram"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode={resolvedTheme === "light" ? "light" : "dark"}
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
          minZoom={0.02}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background color="var(--arch-grid)" gap={32} size={0.6} />
          <Controls showInteractive={false} />
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
        </ReactFlow>
      </div>
    </div>
  );
}
