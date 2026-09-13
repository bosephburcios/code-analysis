import { dependencies, directory, node, type DetectionContext, type ArchitectureNode } from './types.ts';
export function detectFrontend({ files, manifests }: DetectionContext): ArchitectureNode[] {
  const found = new Map<string, ArchitectureNode>();
  for (const file of files) {
    const root = directory(file);
    if (/(?:^|\/)next\.config\.(?:js|ts|mjs|cjs)$/.test(file)) found.set(root, node('frontend', 'Next.js App', root, file));
    if (file.endsWith('package.json')) {
      const deps = dependencies(manifests[file] ?? '');
      const label = deps.includes('next') ? 'Next.js App' : deps.includes('react') ? 'React App' : deps.includes('vue') ? 'Vue App' : deps.includes('svelte') ? 'Svelte App' : null;
      if (label && !found.has(root)) found.set(root, node('frontend', label, root, file));
    }
  }
  return [...found.values()];
}
