import { isIgnored } from '../repository-analysis.ts';
import type { TreeEntry } from '../architecture/fetch-repository-source.ts';
import type { ReadmeProjectStructureEntry } from './types.ts';

// Describe only folders whose contents establish a conventional responsibility.
export function buildProjectStructure(tree: TreeEntry[]): ReadmeProjectStructureEntry[] {
  const files = tree.filter(entry => entry.type === 'blob' && entry.mode !== '120000' && !isIgnored(entry.path)).map(entry => entry.path);
  const directories = new Set(files.flatMap(path => path.split('/').slice(0, -1).map((_, index) => path.split('/').slice(0, index + 1).join('/'))));
  const entries = [...directories].flatMap(path => {
    const name = path.split('/').at(-1)!;
    const contents = files.filter(file => file.startsWith(`${path}/`));
    const description = name === 'app' && contents.some(file => /\/(page|route)\.[jt]sx?$/.test(file)) ? 'Pages and API routes'
      : name === 'components' && contents.some(file => /\.[jt]sx$/.test(file)) ? 'Interface components'
      : name === 'lib' ? 'Application logic and shared utilities'
      : name === 'prisma' && contents.some(file => file.endsWith('.prisma') || file.endsWith('.sql')) ? 'Database schema and migrations'
      : /^(api|routes)$/.test(name) ? 'API endpoints'
      : name === 'services' ? 'Application services'
      : /^(tests|__tests__)$/.test(name) ? 'Automated tests'
      : name === 'public' ? 'Static assets'
      : name === 'docs' ? 'Project documentation' : undefined;
    return description ? [{ path, type: 'directory' as const, description }] : [];
  });
  // Avoid child folders repeated under a meaningful parent with the same role.
  const selected = entries.filter(entry => !entries.some(parent => entry.path.startsWith(`${parent.path}/`) && entry.description === parent.description))
    .sort((a, b) => a.path.localeCompare(b.path)).slice(0, 8);
  return selected.length ? selected : [...directories].filter(path => !path.includes('/')).slice(0, 6).map(path => ({ path, type: 'directory' }));
}
