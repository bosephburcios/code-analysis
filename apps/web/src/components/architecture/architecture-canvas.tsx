"use client";

import { useMemo } from "react";
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
  frontend: "#79b8ff",
  api: "#e8c876",
  service: "#e8c876",
  database: "#a6ce7a",
  external: "#c7a5fa",
  infra: "#eba675",
};
type ComponentNode = Node<{ component: ArchitectureNode }, "component">;
type BoundaryNode = Node<{ label: string; count: number }, "boundary">;

function Component({ data }: NodeProps<ComponentNode>) {
  const node = data.component;
  const Icon = icons[node.type];
  const confidence = node.metadata?.confidence;
  return (
    <div
      className="flex h-[118px] w-[176px] flex-col items-center justify-center rounded-lg border border-white/10 bg-[#191a19] px-3 text-center shadow-sm"
      title={`${node.label}\n${node.path ?? ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1 !w-1 !border-0 !bg-[#b5b8b1]"
      />
      <Icon
        size={30}
        strokeWidth={1.3}
        color={colors[node.type]}
        aria-hidden="true"
      />
      <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-4 text-[#f1f0e9]">
        {node.label}
      </p>
      <p className="mt-1 w-full truncate font-mono text-[9px] text-[#aaa99f]">
        {typeof confidence === "number"
          ? `${confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Moderate" : "Low"} confidence · ${Math.round(confidence * 100)}%`
          : (node.path ?? node.type)}
      </p>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1 !w-1 !border-0 !bg-[#b5b8b1]"
      />
    </div>
  );
}
function Boundary({ data }: NodeProps<BoundaryNode>) {
  return (
    <div className="h-full w-full rounded-xl border border-[#b69a51]/70 bg-[#b69a51]/10 shadow-[inset_0_0_0_3px_#b69a5110]">
      <div className="m-3 inline-flex max-w-[calc(100%-24px)] items-center gap-3 border border-[#b69a51]/40 bg-[#151613] px-2 py-1 text-[10px] uppercase tracking-wider text-[#e9d6a1]">
        <span>{data.label}</span>
        <span className="text-[#a49a7c]">{data.count}</span>
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
          color: edge.kind === "data" ? "#a6ce7a" : "#c4c5bd",
          width: 16,
          height: 16,
        },
        style: {
          stroke: edge.kind === "data" ? "#a6ce7a" : "#c4c5bd",
          strokeWidth: 1.3,
          strokeDasharray: edge.kind === "async" ? "7 6" : undefined,
        },
        labelStyle: { fontSize: 10, fill: "#e9e8e1" },
        labelBgStyle: { fill: "#151613", fillOpacity: 0.95 },
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 3,
        pathOptions: { borderRadius: 18, offset: 35 },
      }));
    return { nodes: [...parents, ...children], edges };
  }, [graphNodes, graphEdges]);

  if (!graphNodes.length)
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        No supported app boundaries detected. The repository overview is
        available below.
      </div>
    );
  return (
    <div className="overflow-hidden rounded-xl border border-[#454338] bg-[#121310]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-[11px] text-[#bbbcb3]">
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
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
          minZoom={0.02}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background color="#44453b" gap={32} size={0.6} />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <div className="space-y-2 rounded-md border border-white/15 bg-[#151613]/95 px-3 py-2 text-[10px] text-[#cecec4]">
              <div className="flex items-center gap-2">
                <ArrowRight size={18} /> Request / dependency
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight size={18} className="text-[#a6ce7a]" /> Data access
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
