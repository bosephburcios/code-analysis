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
  for (const frontend of found.values()) {
    const prefix = frontend.path === '.' ? '' : `${frontend.path}/`;
    const evidence = files.filter(file => {
      if (!file.startsWith(prefix)) return false;
      const relative = file.slice(prefix.length);
      // Page entry points and top-level UI components give responsibility hints,
      // without reading source code or treating every UI primitive as a system.
      return /^(?:src\/)?app\/(?:.*\/)?page\.[jt]sx?$/.test(relative)
        || /^(?:src\/)?components\/[^/]+\.[jt]sx?$/.test(relative)
        || /^(?:src\/)?pages\/(?!api\/|_)[^/].*\.[jt]sx?$/.test(relative);
    });
    const original = frontend.metadata?.evidence;
    frontend.metadata!.evidence = [...new Set([...(typeof original === 'string' ? [original] : []), ...evidence])].sort();
  }
  return [...found.values()];
}
