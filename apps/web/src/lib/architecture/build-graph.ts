import { detectFrontend } from './detect-frontend.ts';
import { detectApi } from './detect-api.ts';
import { detectDatabase } from './detect-database.ts';
import { detectExternal } from './detect-external.ts';
import { directory, node, type ArchitectureGraph, type ArchitectureNode } from './types.ts';

export function buildArchitectureGraph(files: string[], manifests: Record<string, string> = {}): ArchitectureGraph {
  // Fixture applications do not represent deployed system boundaries.
  const context = { files: [...new Set(files)].filter(file => !/(?:^|\/)(?:node_modules|generated|dist|build|vendor|tests?|__tests__|fixtures?|examples?)(?:\/)/.test(file)).sort(), manifests };
  const frontends = detectFrontend(context);
  const apis = detectApi(context);
  const databases = detectDatabase(context);
  const external = detectExternal(context);
  const infra = context.files.filter(file => /(?:^|\/)(?:Dockerfile(?:\.[^/]+)?|(?:docker-compose|compose).*\.ya?ml|[^/]+\.tf|vercel\.json)$/.test(file))
    .map(file => node('infra', file.endsWith('.tf') ? 'Terraform' : file.endsWith('vercel.json') ? 'Vercel Config' : 'Docker Config', file, file));
  const nodes = [...frontends, ...apis, ...databases, ...external, ...infra].sort((a, b) => a.id.localeCompare(b.id));
  const edges: ArchitectureGraph['edges'] = [];
  const connect = (source: ArchitectureNode, target: ArchitectureNode, kind: 'sync' | 'data', label: string) => edges.push({ id: `${source.id}->${target.id}`, source: source.id, target: target.id, kind, label });
  for (const frontend of frontends) for (const api of apis) if (frontend.path === api.path) connect(frontend, api, 'sync', 'requests (inferred)');
  // Match each dependency to the closest enclosing app, never every app in a monorepo.
  for (const dependency of [...databases, ...external]) {
    const path = dependency.type === 'database' ? directory(dependency.path!) : dependency.path!;
    const owners = [...apis, ...frontends].filter(app => app.path === '.' || path === app.path || path.startsWith(`${app.path}/`))
      .sort((a, b) => b.path!.length - a.path!.length || Number(a.type === 'frontend') - Number(b.type === 'frontend'));
    if (owners[0]) connect(owners[0], dependency, dependency.type === 'database' ? 'data' : 'sync', dependency.type === 'database' ? 'queries (inferred)' : 'SDK dependency');
  }
  return { nodes, edges: edges.sort((a, b) => a.id.localeCompare(b.id)) };
}
