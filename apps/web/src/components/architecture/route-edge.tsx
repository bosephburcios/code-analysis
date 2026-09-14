import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";

export type RouteEdgeData = { points: { x: number; y: number }[] };
export type RouteEdge = Edge<RouteEdgeData, "route">;

// Built-in edge types compute their own labelX/labelY internally from their
// curve math; a custom edge has to do the same — this walks the point list
// by arc length to find the coordinate at the halfway point.
function midpoint(points: { x: number; y: number }[]) {
  const segments = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = segments.reduce((sum, length) => sum + length, 0);
  let travelled = 0;
  for (let i = 0; i < segments.length; i++) {
    if (travelled + segments[i] >= total / 2) {
      const t = segments[i] === 0 ? 0 : (total / 2 - travelled) / segments[i];
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    travelled += segments[i];
  }
  return points[points.length - 1];
}

export function RouteEdgeComponent({
  data, style, markerStart, markerEnd, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth,
}: EdgeProps<RouteEdge>) {
  const points = data?.points ?? [];
  if (points.length < 2) return null;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const mid = midpoint(points);
  return (
    <BaseEdge
      path={path} style={style} markerStart={markerStart} markerEnd={markerEnd}
      label={label} labelX={mid.x} labelY={mid.y} labelStyle={labelStyle} labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle} labelBgPadding={labelBgPadding} labelBgBorderRadius={labelBgBorderRadius}
      interactionWidth={interactionWidth}
    />
  );
}
