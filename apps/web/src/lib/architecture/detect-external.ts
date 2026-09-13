import { dependencies, directory, node, type DetectionContext, type ArchitectureNode } from './types.ts';
export function detectExternal({ files, manifests }: DetectionContext): ArchitectureNode[] {
  const nodes: ArchitectureNode[] = [];
  for (const file of files) {
    const deps = file.endsWith('package.json') ? dependencies(manifests[file] ?? '') : [];
    const labels = new Set<string>();
    for (const dep of deps) {
      if (dep === 'aws-sdk' || dep.startsWith('@aws-sdk/')) labels.add('AWS');
      if (dep === '@supabase/supabase-js') labels.add('Supabase');
      if (dep === 'stripe') labels.add('Stripe');
      if (dep === 'openai') labels.add('OpenAI API');
    }
    if (/(?:requirements[^/]*\.txt|pyproject\.toml)$/.test(file) && /\bboto3\b/.test(manifests[file] ?? '')) labels.add('AWS');
    for (const label of labels) nodes.push(node('external', label, directory(file), file));
  }
  return nodes;
}
