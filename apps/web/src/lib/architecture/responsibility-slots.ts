import type { ArchitectureContext } from './build-ai-context.ts';
import { groupBudgets } from './semantic-schema.ts';

type Category = keyof typeof groupBudgets;
const categoryFor = (type: string): Category => (type === 'api' || type === 'service' ? 'backend' : type === 'infra' ? 'infrastructure' : type) as Category;
const directory = (path: string) => path.slice(0, path.lastIndexOf('/'));
const stop = new Set(['src', 'lib', 'app', 'api', 'components', 'component', 'route', 'page', 'index', 'ts', 'tsx', 'js', 'jsx', 'get', 'set', 'use', 'default']);
function tokens(label: string) {
  return new Set(label.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2 && !stop.has(word)));
}

// Pick bounded, distinct entry points first; attach helper modules by imports and
// shared responsibility terms. This prevents a small model from using its last
// available slot as a catch-all for unrelated source files.
export function responsibilitySlots(evidence: ArchitectureContext) {
  const components = evidence.components;
  const neighbors = new Map(components.map(node => [node.id, new Set<string>()]));
  for (const edge of evidence.relationships) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  const termSets = new Map(components.map(node => [node.id, tokens(`${node.label} ${(Array.isArray(node.exports) ? node.exports : []).join(' ')}`)]));
  const frequencies = new Map<string, number>();
  for (const terms of termSets.values()) for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const assignments: Record<string, string> = {};
  const hints: { id: string; category: Category; primarySource: string; label: string; sourceNodeIds: string[] }[] = [];
  for (const category of Object.keys(groupBudgets) as Category[]) {
    const members = components.filter(node => categoryFor(node.type) === category);
    if (!members.length) continue;
    const limit = Math.min(members.length, groupBudgets[category]);
    const anchors: typeof members = [];
    const add = (node: typeof members[number] | undefined) => {
      if (node && anchors.length < limit && !anchors.includes(node)) anchors.push(node);
    };
    const byImportance = (a: typeof members[number], b: typeof members[number]) => (neighbors.get(b.id)?.size ?? 0) - (neighbors.get(a.id)?.size ?? 0) || a.id.localeCompare(b.id);
    if (category === 'frontend') {
      const families = new Map<string, typeof members>();
      for (const node of members) {
        const relative = node.path?.split('/components/')[1] ?? node.path?.replace(/^components\//, '');
        const family = relative?.includes('/') ? `${node.path!.slice(0, node.path!.length - relative.length)}${relative.split('/')[0]}` : node.id;
        families.set(family, [...(families.get(family) ?? []), node]);
      }
      for (const family of [...families.values()].sort((a, b) => a[0].id.localeCompare(b[0].id))) {
        const boundaryScore = (node: typeof members[number]) => evidence.relationships.filter(edge => edge.target === node.id && directory(components.find(source => source.id === edge.source)?.path ?? '') !== directory(node.path ?? '')).length;
        add([...family].sort((a, b) => boundaryScore(b) - boundaryScore(a) || byImportance(a, b))[0]);
      }
    } else if (category === 'backend') {
      // HTTP entry points and separately detected services are real boundaries.
      members.filter(node => node.type === 'api' || !node.id.startsWith('source:')).sort(byImportance).forEach(add);
      // Outbound integrations and persistence are distinct backend responsibilities.
      for (const target of components.filter(node => node.type === 'external' || node.type === 'database')) {
        const callers = members.filter(node => node.type !== 'api' && evidence.relationships.some(edge => edge.source === node.id && edge.target === target.id));
        add(callers.sort(byImportance)[0]);
      }
      // Prefer helper entry points with downstream work over leaf utilities.
      const fanout = (node: typeof members[number]) => evidence.relationships.filter(edge => edge.source === node.id && edge.label !== 'imports component').length;
      [...members].sort((a, b) => fanout(b) - fanout(a) || byImportance(a, b)).forEach(add);
    } else members.sort(byImportance).forEach(add);
    for (const [index, anchor] of anchors.entries()) hints.push({id: `${category}-${index}`, category, primarySource: anchor.id, label: anchor.label, sourceNodeIds: []});
    const slots = hints.filter(hint => hint.category === category);
    for (const member of members) {
      const direct = slots.find(slot => slot.primarySource === member.id);
      const distances = new Map([[member.id, 0]]);
      const queue = [member.id];
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i]; const distance = distances.get(current)!;
        if (distance >= 3) continue;
        for (const neighbor of neighbors.get(current) ?? []) if (!distances.has(neighbor)) { distances.set(neighbor, distance + 1); queue.push(neighbor); }
      }
      const score = (slot: typeof slots[number]) => {
        const anchor = components.find(node => node.id === slot.primarySource)!;
        let weight = 0;
        for (const term of termSets.get(member.id) ?? []) if (termSets.get(anchor.id)?.has(term)) weight += 3 * Math.log(1 + components.length / frequencies.get(term)!);
        const distance = distances.get(anchor.id);
        if (distance) weight += 12 / distance;
        if (member.path && anchor.path && directory(member.path) === directory(anchor.path)) weight += 4;
        return weight;
      };
      const slot = direct ?? [...slots].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
      assignments[member.id] = slot.id;
      slot.sourceNodeIds.push(member.id);
    }
  }
  return { assignments, hints };
}
