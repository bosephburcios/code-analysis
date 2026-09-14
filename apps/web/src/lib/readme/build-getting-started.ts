import type { TreeEntry } from "../architecture/fetch-repository-source.ts";
import type { ReadmeGettingStarted } from "./types.ts";

const SCRIPT_KEYS = ["dev", "build", "start", "test"] as const;
type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

function prefixedPath(directory: string, name: string) {
  return directory ? `${directory}/${name}` : name;
}

export function detectPackageManager(
  tree: TreeEntry[],
  directory = "",
): PackageManager {
  const has = (name: string) =>
    tree.some((entry) => entry.path === prefixedPath(directory, name));
  if (has("pnpm-lock.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  if (has("bun.lockb") || has("bun.lock")) return "bun";
  return "npm";
}

function cdPrefix(directory: string) {
  return directory ? `cd ${directory} && ` : "";
}

export function installCommandFor(
  packageManager: PackageManager,
  directory = "",
) {
  return `${cdPrefix(directory)}${{ npm: "npm install", pnpm: "pnpm install", yarn: "yarn install", bun: "bun install" }[packageManager]}`;
}

function runCommandFor(
  packageManager: PackageManager,
  script: string,
  directory: string,
) {
  return `${cdPrefix(directory)}${packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`}`;
}

// CodeMap's own repo has no root package.json at all — the real project
// lives one level down (apps/web) with its own manifest and lockfile. Probe
// common monorepo app/package directories so analyzing a repo shaped like
// this (or a real npm/yarn/pnpm workspaces root with no root-level scripts)
// still surfaces real, runnable commands instead of omitting the section.
export function findWorkspaceManifestCandidates(
  tree: TreeEntry[],
  limit = 6,
): string[] {
  return tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        /^(?:apps|packages)\/[^/]+\/package\.json$/.test(entry.path),
    )
    .map((entry) => entry.path)
    .sort()
    .slice(0, limit);
}

export function hasUsableScripts(packageJsonContent: string): boolean {
  try {
    const manifest = JSON.parse(packageJsonContent);
    return SCRIPT_KEYS.some(
      (key) => typeof manifest.scripts?.[key] === "string",
    );
  } catch {
    return false;
  }
}

export function extractScripts(
  packageJsonContent: string,
  packageManager: PackageManager,
  directory = "",
): { name: string; command: string }[] {
  try {
    const manifest = JSON.parse(packageJsonContent);
    const scripts = manifest.scripts ?? {};
    return SCRIPT_KEYS.filter((key) => typeof scripts[key] === "string").map(
      (key) => ({
        name: key,
        command: runCommandFor(packageManager, key, directory),
      }),
    );
  } catch {
    return [];
  }
}

// Key names only — values are secrets/environment-specific and never read.
export function extractEnvVarNames(envFileContent: string): string[] {
  const names = new Set<string>();
  for (const line of envFileContent.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match) names.add(match[1]);
  }
  return [...names];
}

export function buildGettingStarted(input: {
  tree: TreeEntry[];
  scriptsPackageJson: string | null;
  scriptsDirectory: string;
  envVarNames: string[];
}): ReadmeGettingStarted {
  if (!input.scriptsPackageJson) return null;
  const packageManager = detectPackageManager(
    input.tree,
    input.scriptsDirectory,
  );
  const scripts = extractScripts(
    input.scriptsPackageJson,
    packageManager,
    input.scriptsDirectory,
  );
  return {
    packageManager,
    installCommand: installCommandFor(packageManager, input.scriptsDirectory),
    scripts,
    envVars: input.envVarNames,
  };
}
