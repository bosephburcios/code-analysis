import type { SourceFacts } from './source-facts.ts';
import type { PackageUsage } from './types.ts';
import { directory } from './types.ts';

function packageName(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('/')) return null;
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  return parts[0] || null;
}

function closestManifest(path: string, manifestPaths: Set<string>): string | null {
  let dir = directory(path);
  while (dir !== '.') {
    const candidate = `${dir}/package.json`;
    if (manifestPaths.has(candidate)) return candidate;
    dir = directory(dir);
  }
  return manifestPaths.has('package.json') ? 'package.json' : null;
}

export function buildPackageUsage(facts: Map<string, SourceFacts>, manifests: Record<string, string>): PackageUsage[] {
  const manifestPaths = new Set(Object.keys(manifests).filter(path => /(?:^|\/)package\.json$/.test(path)));
  const parsedManifests = new Map<string, { dependencies: Record<string, string>; devDependencies: Record<string, string> }>();
  const usage = new Map<string, PackageUsage>();

  for (const [path, fact] of facts) {
    const manifestPath = closestManifest(path, manifestPaths);
    if (!manifestPath) continue;

    let manifest = parsedManifests.get(manifestPath);
    if (!manifest) {
      try {
        const json = JSON.parse(manifests[manifestPath]);
        manifest = { dependencies: json?.dependencies ?? {}, devDependencies: json?.devDependencies ?? {} };
      } catch {
        manifest = { dependencies: {}, devDependencies: {} };
      }
      parsedManifests.set(manifestPath, manifest);
    }

    for (const imported of fact.imports) {
      const name = packageName(imported.specifier);
      if (!name) continue;
      const version = manifest.dependencies[name] ?? manifest.devDependencies[name];
      if (!version) continue; // builtin, unresolved workspace alias, or an unscanned manifest — drop, same precedent as local-import resolution

      const key = `${manifestPath}:${name}`;
      const entry = usage.get(key) ?? {
        name,
        version,
        kind: manifest.dependencies[name] ? ('dependency' as const) : ('devDependency' as const),
        manifestPath,
        importedBy: [],
      };
      if (!entry.importedBy.includes(path)) entry.importedBy.push(path);
      usage.set(key, entry);
    }
  }

  return [...usage.values()].sort((a, b) => a.name.localeCompare(b.name) || a.manifestPath.localeCompare(b.manifestPath));
}
