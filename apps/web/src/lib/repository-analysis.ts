import { buildArchitectureGraph } from "./architecture/build-graph.ts";
import type { ArchitectureGraph } from "./architecture/types.ts";
import {
  buildResponsibilityGraph,
  isArchitectureSource,
} from "./architecture/build-responsibilities.ts";
export type TreeEntry = {
  path: string;
  type: string;
  sha: string;
  size?: number;
  mode?: string;
};
export type Analysis = {
  version: 1;
  treeSha: string;
  fileCount: number;
  ignoredFileCount: number;
  languages: { name: string; count: number; percentage: number }[];
  tools: string[];
  manifestCoverage?: {
    scanned: number;
    total: number;
    complete: boolean;
    reason?: string;
  };
};

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "out",
  "coverage",
  ".cache",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  "vendor",
  "target",
  "generated",
  ".generated",
  ".terraform",
  ".yarn",
  ".idea",
  ".vscode",
]);
const ignoredFiles = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  "uv.lock",
  "Cargo.lock",
  ".DS_Store",
]);
export function isIgnored(path: string): boolean {
  const parts = path.split("/");
  const name = parts.at(-1)!;
  return (
    parts.slice(0, -1).some((part) => ignoredDirectories.has(part)) ||
    ignoredFiles.has(name) ||
    /(?:\.min\.(?:js|css)|\.map|\.pyc|\.generated\.[^/]+)$/.test(name)
  );
}
const extensions: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  pyi: "Python",
  css: "CSS",
  scss: "CSS",
  sass: "CSS",
  less: "CSS",
  html: "HTML",
  htm: "HTML",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  c: "C",
  h: "C",
  cpp: "C++",
  hpp: "C++",
  swift: "Swift",
  vue: "Vue",
  svelte: "Svelte",
  sh: "Shell",
  sql: "SQL",
  dart: "Dart",
};
export function languageFor(path: string): string {
  return extensions[path.split(".").at(-1)!.toLowerCase()] ?? "Other";
}
export function isManifest(path: string): boolean {
  return /(?:^|\/)(?:package\.json|tsconfig(?:\.[^/]+)?\.json|schema\.prisma|requirements[^/]*\.txt|pyproject\.toml|Pipfile|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$/.test(
    path,
  );
}
export function summarize(
  tree: TreeEntry[],
  treeSha: string,
  manifests: Record<string, string>,
): Analysis {
  const blobs = tree.filter(
    (entry) => entry.type === "blob" && entry.mode !== "120000",
  );
  const files = blobs.filter((entry) => !isIgnored(entry.path));
  const counts = new Map<string, number>();
  const tools = new Set<string>();
  for (const file of files) {
    const language = languageFor(file.path);
    counts.set(language, (counts.get(language) ?? 0) + 1);
    const name = file.path.split("/").at(-1)!;
    if (
      /^Dockerfile(?:\..+)?$/.test(name) ||
      /^(?:docker-compose|compose).*\.ya?ml$/.test(name)
    )
      tools.add("Docker");
    if (/^next\.config\./.test(name)) tools.add("Next.js");
    if (name.endsWith(".prisma")) tools.add("Prisma");
    if (name.endsWith(".tf")) tools.add("Terraform");
    if (file.path.startsWith(".github/workflows/")) tools.add("GitHub Actions");
    const content = manifests[file.path];
    if (!content) continue;
    if (name === "package.json") {
      let manifest;
      try {
        manifest = JSON.parse(content);
      } catch {
        throw new Error(`Invalid package.json: ${file.path}`);
      }
      const dependencies = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
        ...manifest.optionalDependencies,
      });
      const known: Record<string, string> = {
        next: "Next.js",
        react: "React",
        vue: "Vue",
        svelte: "Svelte",
        vite: "Vite",
        prisma: "Prisma",
        "@prisma/client": "Prisma",
        pg: "PostgreSQL",
        postgres: "PostgreSQL",
        express: "Express",
        tailwindcss: "Tailwind CSS",
        typescript: "TypeScript",
        "aws-sdk": "AWS SDK",
      };
      for (const dependency of dependencies) {
        if (known[dependency]) tools.add(known[dependency]);
        if (dependency.startsWith("@aws-sdk/")) tools.add("AWS SDK");
      }
    } else if (name.endsWith(".prisma")) {
      if (/provider\s*=\s*"postgresql"/.test(content)) tools.add("PostgreSQL");
    } else if (/^(requirements|pyproject|Pipfile)/.test(name)) {
      for (const [pattern, tool] of [
        [/\bfastapi\b/i, "FastAPI"],
        [/\bdjango\b/i, "Django"],
        [/\bflask\b/i, "Flask"],
        [/\bboto3\b/i, "AWS SDK"],
        [/\b(psycopg2?|asyncpg)\b/i, "PostgreSQL"],
      ] as const) {
        if (pattern.test(content.replace(/^\s*#.*$/gm, ""))) tools.add(tool);
      }
    } else if (/image:\s*["']?postgres(?::|\s|["'])/m.test(content))
      tools.add("PostgreSQL");
  }
  const languages = [...counts]
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.floor((count * 100) / files.length),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  // Largest remainder rounding keeps the displayed percentages at exactly 100%.
  let remainder = files.length
    ? 100 - languages.reduce((sum, item) => sum + item.percentage, 0)
    : 0;
  const ranked = [...languages].sort(
    (a, b) =>
      (((b.count * 100) / files.length) % 1) -
      (((a.count * 100) / files.length) % 1),
  );
  for (const item of ranked) {
    if (remainder-- > 0) item.percentage++;
  }
  return {
    version: 1,
    treeSha,
    fileCount: files.length,
    ignoredFileCount: blobs.length - files.length,
    languages,
    tools: [...tools].sort(),
  };
}

export async function ingestRepository(
  owner: string,
  name: string,
  branch: string,
  fetcher: typeof fetch = fetch,
): Promise<Analysis & { architecture: ArchitectureGraph }> {
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const signal = AbortSignal.timeout(90_000);
  async function get(path: string) {
    const response = await fetcher(`${base}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429)
        throw new Error(
          "GitHub denied the request or its rate limit was reached. Try again later.",
        );
      if (response.status === 404)
        throw new Error("Repository or branch not found on GitHub.");
      if (response.status === 409)
        throw new Error("This repository is empty. Add a commit, then retry.");
      throw new Error(`GitHub request failed (${response.status}). Try again.`);
    }
    return response.json();
  }
  const tree = (await get(
    `/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  )) as { sha: string; truncated: boolean; tree: TreeEntry[] };
  if (tree.truncated)
    throw new Error(
      "This repository exceeds GitHub’s complete tree limit. Analysis was not saved.",
    );
  const candidates = tree.tree.filter(
    (entry) =>
      entry.type === "blob" &&
      entry.mode !== "120000" &&
      !isIgnored(entry.path) &&
      isManifest(entry.path),
  );
  // Scan root/workspace manifests before examples and test fixtures.
  candidates.sort((a, b) => {
    const priority = (path: string) =>
      (/(?:^|\/)(?:tests?|__tests__|fixtures?|examples?)(?:\/)/.test(path)
        ? 1000
        : 0) + path.split("/").length;
    return priority(a.path) - priority(b.path) || a.path.localeCompare(b.path);
  });
  const manifests: Record<string, string> = {};
  const bySha = new Map<string, TreeEntry[]>();
  for (const entry of candidates) {
    const paths = bySha.get(entry.sha) ?? [];
    paths.push(entry);
    bySha.set(entry.sha, paths);
  }
  const groups = [...bySha.values()];
  let reason: string | undefined;
  // Bound concurrency and content size, but do not reject large repositories.
  for (let offset = 0; offset < groups.length; offset += 5) {
    const results = await Promise.allSettled(
      groups.slice(offset, offset + 5).map(async (entries) => {
        const entry = entries[0];
        if ((entry.size ?? 0) > 1_000_000)
          throw new Error(`Manifest is too large: ${entry.path}`);
        const blob = (await get(`/git/blobs/${entry.sha}`)) as {
          content: string;
          encoding: string;
          size: number;
        };
        if (blob.encoding !== "base64" || blob.size > 1_000_000)
          throw new Error(`Cannot read manifest: ${entry.path}`);
        const content = Buffer.from(blob.content, "base64").toString("utf8");
        for (const path of entries) manifests[path.path] = content;
      }),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") {
      reason =
        failure.reason instanceof Error &&
        failure.reason.name !== "TimeoutError"
          ? failure.reason.message
          : "The manifest scan reached its time limit.";
      break;
    }
  }
  const analysis = summarize(tree.tree, tree.sha, manifests);
  const scanned = Object.keys(manifests).length;
  analysis.manifestCoverage = {
    scanned,
    total: candidates.length,
    complete: scanned === candidates.length,
    ...(reason ? { reason } : {}),
  };
  const retained = tree.tree.filter(
    (entry) =>
      entry.type === "blob" &&
      entry.mode !== "120000" &&
      !isIgnored(entry.path),
  );
  const sourceCandidates = retained
    .filter((entry) => isArchitectureSource(entry.path))
    .sort((a, b) => {
      const priority = (path: string) =>
        /\/api\//.test(path)
          ? 0
          : /\/(?:lib|services|server)\//.test(path)
            ? 1
            : 2;
      return (
        priority(a.path) - priority(b.path) || a.path.localeCompare(b.path)
      );
    });
  const sources: Record<string, string> = {};
  let sourceReason: string | undefined;
  let sourceBytes = 0;
  // Source snapshots share the tree's immutable blob SHAs. Never fetch .env or execute code.
  const selected = sourceCandidates.slice(0, 100);
  if (selected.length < sourceCandidates.length)
    sourceReason = "Source scan limited to 100 files.";
  for (let offset = 0; offset < selected.length; offset += 5) {
    const results = await Promise.allSettled(
      selected.slice(offset, offset + 5).map(async (entry) => {
        if ((entry.size ?? 0) > 100_000)
          throw new Error("Some source files exceed the 100 KB scan limit.");
        const blob = (await get(`/git/blobs/${entry.sha}`)) as {
          content: string;
          encoding: string;
          size: number;
        };
        if (blob.encoding !== "base64" || blob.size > 100_000)
          throw new Error("Some source files could not be scanned.");
        const bytes = Buffer.from(blob.content, "base64");
        if (bytes.length > 100_000 || sourceBytes + bytes.length > 2_000_000)
          throw new Error("Source scan reached its 2 MB limit.");
        sourceBytes += bytes.length;
        sources[entry.path] = bytes.toString("utf8");
      }),
    );
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) {
      const failure = failures[0] as PromiseRejectedResult;
      sourceReason =
        failure.reason instanceof Error &&
        failure.reason.name !== "TimeoutError"
          ? failure.reason.message
          : "Source scan reached its time limit.";
      // Preserve the successfully scanned subset, clearly marked as partial.
      if (signal.aborted || /rate limit|GitHub/.test(sourceReason)) break;
    }
  }
  const files = retained.map((entry) => entry.path);
  const architecture = buildArchitectureGraph(files, manifests);
  architecture.responsibilities = buildResponsibilityGraph(
    files,
    sources,
    manifests,
    architecture,
    {
      scanned: Object.keys(sources).length,
      total: sourceCandidates.length,
      complete: Object.keys(sources).length === sourceCandidates.length,
      ...(sourceReason ? { reason: sourceReason } : {}),
    },
  );
  return { ...analysis, architecture };
}
