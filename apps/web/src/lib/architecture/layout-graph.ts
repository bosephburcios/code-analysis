import type { ArchitectureNode } from './types.ts';

const sections = [
  { id: 'frontend', label: 'Frontend', types: ['frontend'] },
  { id: 'backend', label: 'Backend API & services', types: ['api', 'service'] },
  { id: 'data', label: 'Data stores', types: ['database'] },
  { id: 'external', label: 'External services', types: ['external'] },
  { id: 'infra', label: 'Infrastructure & configuration', types: ['infra'] },
];

export function layoutArchitecture(nodes: ArchitectureNode[]) {
  const groups = sections.flatMap(section => {
    const members = nodes.filter(node => section.types.includes(node.type)).sort((a, b) => a.id.localeCompare(b.id));
    if (!members.length) return [];
    const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(members.length))));
    return [{ id: `boundary:${section.id}`, category: section.id, label: section.label, width: columns * 200 + 48, height: Math.ceil(members.length / columns) * 142 + 88,
      position: { x: 0, y: 0 }, members: members.map((node, index) => ({ node, position: { x: 24 + index % columns * 200, y: 64 + Math.floor(index / columns) * 142 } })) }];
  });
  const get = (id: string) => groups.find(group => group.category === id);
  const front = get('frontend'); const back = get('backend'); const data = get('data'); const external = get('external'); const infra = get('infra');
  const middleX = front ? front.width + 150 : 0;
  const rightX = middleX + Math.max(back?.width ?? 0, infra?.width ?? 0) + (back || infra ? 170 : 0);
  if (front) front.position = { x: 0, y: 140 };
  if (back) back.position = { x: middleX, y: 140 };
  if (data) data.position = { x: rightX, y: 140 };
  if (external) external.position = { x: rightX, y: data ? data.height + 250 : 140 };
  if (infra) infra.position = { x: middleX, y: back ? back.height + 290 : 140 };
  return groups;
}
