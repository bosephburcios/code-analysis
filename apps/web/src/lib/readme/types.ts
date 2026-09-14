export type ReadmeSectionKey =
  | "hero"
  | "implementationHighlights"
  | "title"
  | "tagline"
  | "badges"
  | "overview"
  | "architecture"
  | "keyFlows"
  | "components"
  | "codeExamples"
  | "techStack"
  | "projectStructure"
  | "gettingStarted";

export type ReadmeBadge = {
  label: string;
  value: string;
  color: string;
  logo?: string;
  url: string;
};

export type ReadmeKeyFlow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  nodeIds: string[];
  edgeIds: string[];
  nodeLabels: string[];
  imagePath: string;
};

export type ReadmeComponent = {
  id: string;
  label: string;
  role: string;
  description: string;
  rationale?: string;
  technologies: string[];
  files: string[];
};

export type ReadmeCodeExample = {
  description?: string;
  componentId: string;
  componentLabel: string;
  path: string;
  startLine: number;
  endLine: number;
  code: string;
  truncated: boolean;
};

export type ReadmeTechStackEntry = {
  category: string;
  items: { name: string; badge?: ReadmeBadge }[];
};

export type ReadmeProjectStructureEntry = {
  description?: string;
  path: string;
  type: "directory" | "file";
  fileCount?: number;
};

export type ReadmeGettingStarted = {
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  installCommand: string;
  scripts: { name: string; command: string }[];
  envVars: string[];
} | null;

export type GeneratedReadme = {
  version: 1;
  title: string;
  tagline: string;
  badges: ReadmeBadge[];
  overview: string;
  architecture: { imagePath: string; nodeCount: number; edgeCount: number; description?: string };
  keyFlows: ReadmeKeyFlow[];
  components: ReadmeComponent[];
  codeExamples: ReadmeCodeExample[];
  techStack: ReadmeTechStackEntry[];
  projectStructure: ReadmeProjectStructureEntry[];
  gettingStarted: ReadmeGettingStarted;
  generatedAt: string;
  sourceSemanticGeneratedAt: string | null;
};
