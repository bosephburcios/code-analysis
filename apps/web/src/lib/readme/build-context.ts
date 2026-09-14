import {
  fetchRepositoryTree,
  fetchRepositoryBlob,
  type TreeEntry,
} from "../architecture/fetch-repository-source.ts";
import { loadComponentEvidence } from "../architecture/load-component-evidence.ts";
import {
  reconcileSemanticRoles,
  roleLabel,
} from "../architecture/semantic-roles.ts";
import {
  architectureEvidence,
  type ArchitectureGraph,
} from "../architecture/types.ts";
import type { SemanticArchitecture } from "../architecture/semantic-schema.ts";
import type { Analysis } from "../repository-analysis.ts";
import {
  selectWorkflowSteps,
  type CandidateFlow,
} from "./select-key-flows.ts";
import {
  selectCodeExampleCandidates,
  toReadmeCodeExample,
} from "./select-code-examples.ts";
import { buildBadges } from "./build-badges.ts";
import { buildTechStack } from "./build-tech-stack.ts";
import { buildProjectStructure } from "./build-project-structure.ts";
import {
  buildGettingStarted,
  findWorkspaceManifestCandidates,
  hasUsableScripts,
  extractEnvVarNames,
} from "./build-getting-started.ts";
import { ARCHITECTURE_IMAGE_PATH } from "./paths.ts";
import type {
  ReadmeBadge,
  ReadmeComponent,
  ReadmeCodeExample,
  ReadmeTechStackEntry,
  ReadmeProjectStructureEntry,
  ReadmeGettingStarted,
} from "./types.ts";

export type ReadmeCandidateFlow = CandidateFlow & {
  nodeLabels: string[];
  nodeDescriptions: string[];
  edgeLabels: string[];
};
export type ReadmeContext = {
  relationships?: { source: string; target: string; label: string }[];
  title: string;
  badges: ReadmeBadge[];
  architecture: { imagePath: string; nodeCount: number; edgeCount: number };
  candidateFlows: ReadmeCandidateFlow[];
  components: ReadmeComponent[];
  codeExamples: ReadmeCodeExample[];
  techStack: ReadmeTechStackEntry[];
  projectStructure: ReadmeProjectStructureEntry[];
  gettingStarted: ReadmeGettingStarted;
};

async function blobAt(
  owner: string,
  name: string,
  tree: TreeEntry[],
  path: string,
  fetcher: typeof fetch,
): Promise<string | null> {
  const entry = tree.find((candidate) => candidate.path === path);
  if (!entry || entry.type !== "blob") return null;
  return (await fetchRepositoryBlob(owner, name, entry.sha, fetcher)).toString(
    "utf8",
  );
}

// Picks whichever package.json actually has runnable dev/build/start/test
// scripts: the repo root if it has them directly, otherwise the first
// workspace-shaped candidate (apps/*/package.json, packages/*/package.json)
// that does — covering both a real npm/yarn/pnpm workspaces root with no
// root-level scripts AND a plain nested-app layout with no root manifest at
// all (CodeMap's own repo is the latter: apps/web/package.json, no root
// package.json). Returns the directory that manifest lives in ("" for root)
// so commands can be prefixed with a `cd` when it isn't the repo root.
async function resolveGettingStarted(
  owner: string,
  name: string,
  tree: TreeEntry[],
  fetcher: typeof fetch,
): Promise<ReadmeGettingStarted> {
  const rootPackageJson = await blobAt(
    owner,
    name,
    tree,
    "package.json",
    fetcher,
  );

  let scriptsPackageJson: string | null = null;
  let scriptsDirectory = "";
  if (rootPackageJson && hasUsableScripts(rootPackageJson)) {
    scriptsPackageJson = rootPackageJson;
  } else {
    for (const candidatePath of findWorkspaceManifestCandidates(tree)) {
      const content = await blobAt(owner, name, tree, candidatePath, fetcher);
      if (content && hasUsableScripts(content)) {
        scriptsPackageJson = content;
        scriptsDirectory = candidatePath.replace(/\/package\.json$/, "");
        break;
      }
    }
  }
  if (!scriptsPackageJson) return null;

  const envFile =
    (await blobAt(owner, name, tree, ".env.example", fetcher)) ??
    (await blobAt(owner, name, tree, ".env.sample", fetcher)) ??
    (scriptsDirectory
      ? ((await blobAt(
          owner,
          name,
          tree,
          `${scriptsDirectory}/.env.example`,
          fetcher,
        )) ??
        (await blobAt(
          owner,
          name,
          tree,
          `${scriptsDirectory}/.env.sample`,
          fetcher,
        )))
      : null);
  const envVarNames = envFile ? extractEnvVarNames(envFile) : [];

  return buildGettingStarted({
    tree,
    scriptsPackageJson,
    scriptsDirectory,
    envVarNames,
  });
}

export async function buildReadmeContext(
  input: {
    repository: { owner: string; name: string; treeSha: string };
    analysis: Analysis;
    semantic: SemanticArchitecture;
    rawGraph: ArchitectureGraph;
  },
  fetcher: typeof fetch = fetch,
): Promise<ReadmeContext> {
  const { owner, name, treeSha } = input.repository;
  const semantic = reconcileSemanticRoles(
    input.semantic,
    architectureEvidence(input.rawGraph).nodes,
  );
  const tree = await fetchRepositoryTree(owner, name, treeSha, fetcher);

  const components: ReadmeComponent[] = semantic.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    role: roleLabel(node),
    description: node.description,
    rationale: node.rationale,
    technologies: node.technologies,
    files: node.files,
  }));

  const nodesById = new Map(semantic.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(semantic.edges.map((edge) => [edge.id, edge]));
  const candidateFlows: ReadmeCandidateFlow[] = selectWorkflowSteps(
    semantic,
  ).map((flow) => ({
    ...flow,
    nodeLabels: flow.nodeIds.map((id) => nodesById.get(id)?.label ?? id),
    nodeDescriptions: flow.nodeIds.map(
      (id) => nodesById.get(id)?.description ?? "",
    ),
    edgeLabels: flow.edgeIds.map((id) => edgesById.get(id)?.label ?? ""),
  }));

  const codeExampleCandidates = selectCodeExampleCandidates(semantic, 10);
  const evidenceResults = await Promise.allSettled(
    codeExampleCandidates.map((node) =>
      loadComponentEvidence(
        { owner, name, treeSha, graph: input.rawGraph, node, tree, purpose: 'readme' },
        fetcher,
      ),
    ),
  );
  const codeExamples = evidenceResults
    .flatMap((result, index) =>
      result.status === "fulfilled"
        ? [toReadmeCodeExample(codeExampleCandidates[index], result.value)]
        : [],
    )
    .filter((example): example is ReadmeCodeExample => example !== null)
    .filter((example, index, all) => all.findIndex(other => other.path === example.path || other.code === example.code) === index)
    .slice(0, 4);

  const gettingStarted = await resolveGettingStarted(
    owner,
    name,
    tree,
    fetcher,
  );

  const readmeSource = await blobAt(owner, name, tree, 'README.md', fetcher).catch(() => null);
  const detectedTitle = readmeSource?.match(/^# ([^\n<>\[\]]{1,80})\s*$/m)?.[1]?.trim();
  const enrichedAnalysis = { ...input.analysis, tools: [...new Set([...input.analysis.tools, ...semantic.nodes.flatMap(node => node.technologies),
    ...(semantic.nodes.some(node => node.role === 'api' && node.technologies.includes('Next.js')) ? ['Next.js Route Handlers'] : [])])] };
  return {
    title: detectedTitle ?? name,
    relationships: semantic.edges.map(edge => ({ source: nodesById.get(edge.source)?.label ?? edge.source, target: nodesById.get(edge.target)?.label ?? edge.target, label: edge.label })),
    badges: buildBadges(enrichedAnalysis),
    architecture: {
      imagePath: ARCHITECTURE_IMAGE_PATH,
      nodeCount: semantic.nodes.length,
      edgeCount: semantic.edges.length,
    },
    candidateFlows,
    components,
    codeExamples,
    techStack: buildTechStack(enrichedAnalysis),
    projectStructure: buildProjectStructure(tree),
    gettingStarted,
  };
}
