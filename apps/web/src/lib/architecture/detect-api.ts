import { dependencies, directory, node, type DetectionContext, type ArchitectureNode } from './types.ts';
export function detectApi({ files, manifests }: DetectionContext): ArchitectureNode[] {
  const found = new Map<string, ArchitectureNode>();
  for (const file of files) {
    const route = file.match(/^(.*?)(?:src\/)?(?:app\/api\/(?:.*\/)?route\.[cm]?[jt]s|pages\/api\/.*\.[jt]sx?)$/);
    if (route) {
      const root = route[1].replace(/\/$/, '') || '.';
      const existing = found.get(root);
      if (existing) {
        existing.metadata!.routeCount = Number(existing.metadata!.routeCount ?? 1) + 1;
        const previous = existing.metadata!.evidence;
        existing.metadata!.evidence = [...(Array.isArray(previous) ? previous : typeof previous === 'string' ? [previous] : []), file];
      } else found.set(root, { ...node('api', 'API Routes', root, file), metadata: { evidence: [file], routeCount: 1, inferred: true } });
    }
    const content = manifests[file] ?? '';
    if (/(?:requirements[^/]*\.txt|pyproject\.toml|Pipfile)$/.test(file)) {
      const label = /\bfastapi\b/i.test(content) ? 'FastAPI Service' : /\bflask\b/i.test(content) ? 'Flask Service' : /\bdjango\b/i.test(content) ? 'Django Service' : null;
      if (label) found.set(directory(file), node('service', label, directory(file), file));
    }
    if (file.endsWith('package.json') && dependencies(content).includes('express')) found.set(directory(file), node('api', 'Express API', directory(file), file));
  }
  return [...found.values()];
}
