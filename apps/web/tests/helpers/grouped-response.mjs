// Construct model fixtures against the supplied schema, including unused slots.
export function groupedResponse(input, format) {
  const groups = Object.fromEntries(Object.entries(format.properties.groups.properties).map(([category, schema]) => [category, {
    components: Object.fromEntries(Object.keys(schema.properties.components.properties).map(slot => [slot, {label: 'Unused', responsibility: 'No sources assigned.', role: 'service', rationale: 'N/A', confidence: 0}])),
  }]));
  const assignments = {};
  const used = new Map();
  for (const node of input.nodes) {
    const category = node.type === 'feature' ? 'backend' : node.type;
    const index = used.get(category) ?? 0;
    used.set(category, index + 1);
    const choice = node.sourceNodeIds.map(source => format.properties.assignments.properties[source]?.enum).find(values => values?.length === 1);
    const constant = node.sourceNodeIds.map(source => format.properties.assignments.properties[source]?.const).find(Boolean);
    const slot = constant ?? choice?.[0] ?? Object.keys(groups[category].components)[index];
    if (!slot) throw new Error(`Fixture exceeds ${category} budget`);
    const defaultRole = { frontend: 'ui', database: 'database', external: 'external', infrastructure: 'infrastructure' }[node.type] ?? 'service';
    groups[category].components[slot] = { label: node.label, responsibility: node.description, role: node.role ?? defaultRole, rationale: node.rationale ?? 'Provides this responsibility for the components that depend on it.', confidence: node.confidence };
    for (const source of node.sourceNodeIds) assignments[source] = slot;
  }
  return {assignments, groups};
}
