import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { extractSourceFacts, type SourceFacts } from './source-facts.ts';
import { buildPackageUsage } from './build-packages.ts';
import type { ArchitectureGraph, ArchitectureNode, ResponsibilityGraph, SourceCoverage } from './types.ts';

export function isArchitectureSource(path: string) {
  return /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path)
    && !/(?:^|\/)(?:node_modules|generated|dist|build|tests?|__tests__|fixtures?|examples?|ui|icons|hooks)(?:\/)/.test(path)
    && !/(?:\.test|\.spec)\.[^/]+$/.test(path)
    && /(?:^|\/)(?:src|app|pages|components|lib|services|server|api)\//.test(path)
    && !/(?:^|\/)(?:layout|loading|error|not-found|globals|theme-provider|site-header|mode-toggle)\.[jt]sx?$/.test(path);
}
const words = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const operationLabels: Record<string, string> = { findMany: 'read', findFirst: 'read', findUnique: 'read', upsert: 'save', update: 'update', updateMany: 'update', create: 'create', createMany: 'create', delete: 'delete', deleteMany: 'delete', count: 'count', aggregate: 'aggregate', groupBy: 'group' };
export const appRoot = (path: string) => path.match(/^(.*?)(?:src\/|app\/|pages\/|components\/|lib\/|services\/|server\/)/)?.[1] ?? '';
function routePath(path: string) {
  const match = path.match(/(?:^|\/)(?:src\/)?app\/(api\/(?:.*\/)?|api\/)route\.[cm]?[jt]s$/)
    ?? path.match(/(?:^|\/)(?:src\/)?pages\/(api\/.*)\.[jt]sx?$/);
  return match ? `/${match[1].replace(/\/$/, '').replace(/\/index$/, '')}` : null;
}
function label(path: string) {
  const route = routePath(path);
  if (route) return `${words(route.replace(/^\/api\//, '').replace(/\[[^\]]+\]/g, '').replace(/\//g, ' ').trim()) || 'Application'} API`;
  const basename = posix.basename(path).replace(/\.[^.]+$/, '');
  if (basename === 'page' || basename === 'index') {
    const parent = path.replace(/\/(?:\[[^\]]+\]|\([^)]*\))(?=\/)/g, '').split('/').at(-2) ?? '';
    return `${['app', 'pages'].includes(parent) ? 'Home' : words(parent)} Page Loader`;
  }
  return words(basename);
}

export function buildResponsibilityGraph(files: string[], sources: Record<string, string>, manifests: Record<string, string>, raw: ArchitectureGraph, coverage: SourceCoverage): ResponsibilityGraph {
  const known = new Set(files);
  const nodes = new Map<string, ArchitectureNode>();
  const edges = new Map<string, ArchitectureGraph['edges'][number]>();
  const facts = new Map<string, SourceFacts>();
  const idFor = (path: string) => `source:${path}`;
  const connect = (source: string, target: string, kind: 'sync' | 'data', label: string, evidence: string, names: string[] = []) => {
    if (source === target) return;
    const id = `relationship:${createHash('sha256').update(`${source}->${target}:${label}`).digest('hex').slice(0, 24)}`;
    const existing = edges.get(id);
    if (existing) {
      existing.evidence = [...new Set([...(existing.evidence ?? []), evidence])];
      if (names.length) existing.names = [...new Set([...(existing.names ?? []), ...names])];
    } else edges.set(id, { id, source, target, kind, label, evidence: [evidence], ...(names.length ? { names: [...new Set(names)] } : {}) });
  };
  for (const path of Object.keys(sources).sort()) {
    if (!isArchitectureSource(path)) continue;
    const fact = extractSourceFacts(path, sources[path]);
    facts.set(path, fact);
    const type = routePath(path) ? 'api' : fact.client || !fact.database.length && /(?:^|\/)(?:components|pages)\//.test(path) ? 'frontend' : 'service';
    const technologies = [...new Set(fact.imports.flatMap(item => {
      if (item.specifier === 'react' || item.specifier.startsWith('react/')) return ['React'];
      if (item.specifier.startsWith('next/')) return ['Next.js'];
      if (item.specifier === '@xyflow/react') return ['React Flow'];
      if (/prisma/.test(item.specifier)) return ['Prisma'];
      if (item.specifier === 'pg' || item.specifier === '@prisma/adapter-pg') return ['PostgreSQL'];
      return [];
    }))];
    nodes.set(idFor(path), { id: idFor(path), type, label: label(path), path, metadata: {
      evidence: [path], technologies, exports: fact.exports,
      responsibility: routePath(path) ? `Handles ${fact.exports.filter(name => /^(GET|POST|PUT|PATCH|DELETE)$/.test(name)).join(', ') || 'HTTP'} ${routePath(path)}` : `Module exports: ${fact.exports.join(', ') || 'default export'}`,
      operations: fact.database.map(call => `${call.operation} ${call.model} (${path}:${call.line})`),
    } });
  }
  const resolve = (from: string, specifier: string) => {
    const bases: string[] = [];
    if (specifier.startsWith('.')) bases.push(posix.normalize(posix.join(posix.dirname(from), specifier)));
    else {
      const config = Object.keys(manifests).filter(path => /(?:^|\/)tsconfig\.json$/.test(path) && (posix.dirname(path) === '.' || from.startsWith(`${posix.dirname(path)}/`)))
        .sort((a, b) => b.length - a.length)[0];
      if (config) {
        const parsed = ts.parseConfigFileTextToJson(config, manifests[config]);
        const options = parsed.config?.compilerOptions;
        if (!parsed.error && options?.paths && typeof options.paths === 'object') {
          for (const [alias, targets] of Object.entries(options.paths).sort(([a], [b]) => b.length - a.length)) {
            const [prefix, suffix = ''] = alias.split('*');
            if (alias.includes('*') ? !specifier.startsWith(prefix) || !specifier.endsWith(suffix) : specifier !== alias) continue;
            const wildcard = alias.includes('*') ? specifier.slice(prefix.length, suffix.length ? -suffix.length : undefined) : '';
            if (Array.isArray(targets)) for (const target of targets) if (typeof target === 'string') bases.push(posix.normalize(posix.join(posix.dirname(config), typeof options.baseUrl === 'string' ? options.baseUrl : '.', target.replace('*', wildcard))));
            break;
          }
        }
      }
    }
    bases.push(...bases.map(base => base.replace(/\.[cm]?js$/, '')));
    return bases.flatMap(value => [value, ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'].map(ext => value + ext)]).find(value => known.has(value) && nodes.has(idFor(value))) ?? null;
  };
  // Keep detected infrastructure/data stores and their provenance without duplicating app-wide technology nodes.
  for (const node of raw.nodes.filter(node => ['database', 'external', 'infra', 'service'].includes(node.type)
    || ![...facts.keys()].some(path => node.path === '.' || path.startsWith(`${node.path}/`)))) {
    const schema = (manifests[node.path ?? ''] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const modelBlocks = [...schema.matchAll(/^\s*model\s+(\w+)\s*\{([^}]+)\}/gm)];
    const models = node.type === 'database' ? modelBlocks.flatMap(match => [match[1], ...[...match[2].matchAll(/^\s*(\w+)\s+Json\??\b/gm)].map(field => `${match[1]}.${field[1]} (JSON)`)]) : [];
    nodes.set(node.id, { ...node, metadata: { ...node.metadata, resources: models, technologies: node.label.split(' / ') } });
  }
  for (const [path, fact] of facts) {
    const source = idFor(path);
    for (const imported of fact.imports) {
      const sdk = imported.specifier === 'stripe' ? 'Stripe' : imported.specifier.startsWith('@aws-sdk/') || imported.specifier === 'aws-sdk' ? 'AWS'
        : imported.specifier === '@supabase/supabase-js' ? 'Supabase' : imported.specifier === 'openai' ? 'OpenAI API' : null;
      if (sdk) {
        const dependency = raw.nodes.find(node => node.type === 'external' && node.label === sdk && (node.path === '.' || path.startsWith(`${node.path}/`)));
        if (dependency) connect(source, dependency.id, 'sync', `uses ${sdk} SDK`, path);
      }
      const target = resolve(path, imported.specifier);
      if (!target) continue;
      const operations = fact.database.filter(call => imported.names.includes(call.client));
      if (operations.length) for (const call of operations) connect(source, idFor(target), 'data', `${operationLabels[call.operation]} ${words(call.model).toLowerCase()}`, `${path}:${call.line}`);
      else {
        const invoked = imported.names.filter(name => fact.calls.some(call => call === name || call.startsWith(`${name}.`)));
        connect(source, idFor(target), 'sync', invoked.length ? invoked.slice(0, 2).map(name => words(name).toLowerCase()).join(' / ') : 'imports component', path, invoked.length ? invoked : imported.names);
      }
    }
    for (const request of fact.requests) {
      if (request.url.startsWith('/api/')) {
        const target = [...facts.keys()].find(candidate => {
          const route = routePath(candidate);
          if (!route || appRoot(candidate) !== appRoot(path)) return false;
          const pattern = '^' + route.split('/').map(part => /^\[/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/') + '/?$';
          return new RegExp(pattern).test(request.url);
        });
        if (target) connect(source, idFor(target), 'sync', `${request.method === 'UNKNOWN' ? 'API request' : request.method} ${routePath(target)}`, `${path}:${request.line}`);
        continue;
      }
      // Known service endpoints only; never persist URL credentials/query strings.
      const github = /^https:\/\/api\.github\.com(?:\/|$)/.test(request.url);
      const ollama = /^http:\/\/(?:localhost|127\.0\.0\.1):11434(?:\/|$)/.test(request.url);
      if (!github && !ollama) continue;
      const technologies = nodes.get(source)!.metadata!.technologies;
      nodes.get(source)!.metadata!.technologies = [...new Set([...(Array.isArray(technologies) ? technologies : []), github ? 'GitHub API' : 'Ollama'])];
      const target = github ? 'external:github-api' : `external:${appRoot(path)}ollama`;
      const existing = nodes.get(target);
      nodes.set(target, { id: target, type: 'external', label: github ? 'GitHub API' : 'Local LLM / Ollama', metadata: {
        evidence: [...new Set([...(Array.isArray(existing?.metadata?.evidence) ? existing.metadata.evidence : []), path])],
        technologies: [github ? 'GitHub API' : 'Ollama'],
      } });
      connect(source, target, 'sync', github ? /\/git\/trees/.test(request.url) ? 'fetch repository tree' : /\/git\/blobs/.test(request.url) ? 'fetch source blob' : 'fetch repository metadata' : 'send evidence for grouping', `${path}:${request.line}`);
    }
    if (fact.imports.some(item => /(?:@prisma\/client|generated\/prisma)/.test(item.specifier))) {
      for (const database of raw.nodes.filter(node => node.type === 'database' && appRoot(node.path ?? '') === appRoot(path))) connect(source, database.id, 'data', 'database client', path);
    }
  }
  // Repositories without supported source still retain their detected boundaries.
  if (!facts.size) for (const node of raw.nodes) nodes.set(node.id, node);
  if (!facts.size) for (const edge of raw.edges) edges.set(edge.id, edge);
  const packages = buildPackageUsage(facts, manifests);
  return { version: 1, nodes: [...nodes.values()], edges: [...edges.values()], coverage, packages };
}
