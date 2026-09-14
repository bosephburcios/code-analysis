import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderReadmeMarkdown, V1_SECTION_ORDER } from '../src/lib/readme/render-markdown.ts';

const model = {
  version: 1,
  title: 'code-analysis',
  tagline: 'Understand any codebase.',
  badges: [{ label: 'TypeScript', value: '90%', color: '3178c6', logo: 'typescript', url: 'https://img.shields.io/badge/x' }],
  overview: 'Analyzes a repository and generates its architecture.',
  architecture: { imagePath: 'docs/architecture.png', nodeCount: 2, edgeCount: 1 },
  keyFlows: [{ id: 'flow-0', slug: 'import-flow', title: 'Import Flow', description: 'UI calls API.', nodeIds: ['ui', 'api'], nodeLabels: ['UI', 'API'], edgeIds: ['e1'], imagePath: 'docs/flows/import-flow.png' }],
  components: [{ id: 'api', label: 'Repository API', role: 'Backend API', description: 'Handles import requests.', technologies: ['Next.js', 'Prisma'], files: ['route.ts'] }],
  codeExamples: [{ componentId: 'api', componentLabel: 'Repository API', path: 'apps/web/route.ts', startLine: 3, endLine: 5, code: 'const tree = await fetchTree();\nreturn analyze(tree);', truncated: false }],
  techStack: [{ category: 'Languages', items: [{ name: 'TypeScript', badge: { label: 'TypeScript', value: '90%', color: '3178c6', url: 'https://img.shields.io/badge/x' } }] }],
  projectStructure: [{ path: 'src', type: 'directory', fileCount: 3 }, { path: 'src/lib', type: 'directory', fileCount: 2 }, { path: 'README.md', type: 'file' }],
  gettingStarted: { packageManager: 'npm', installCommand: 'npm install', scripts: [{ name: 'dev', command: 'npm run dev' }], envVars: ['DATABASE_URL'] },
  generatedAt: '2026-01-01T00:00:00.000Z',
  sourceSemanticGeneratedAt: null,
};

test('renders every populated section in V1 order', () => {
  const markdown = renderReadmeMarkdown(model);
  assert.ok(markdown.startsWith('# code-analysis'));
  const positions = ['code-analysis', 'Understand any codebase', 'TypeScript', 'Analyzes a repository', 'Architecture', 'Import Flow', 'Repository API', 'const tree = await fetchTree', 'Tech Stack', 'Project Structure', 'Getting Started']
    .map(needle => markdown.indexOf(needle));
  assert.ok(positions.every(index => index !== -1), 'every expected fragment should appear');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('image references use the model\'s own image paths so they can never drift from the export builder', () => {
  const markdown = renderReadmeMarkdown(model);
  assert.match(markdown, /src="\.\/docs\/architecture\.png"/);
  assert.equal((markdown.match(/<img /g) ?? []).length, 1);
  assert.ok(!markdown.includes('docs/flows/'));
});

test('omits empty sections entirely rather than rendering an empty heading', () => {
  const minimal = { ...model, keyFlows: [], codeExamples: [], projectStructure: [], gettingStarted: null };
  const markdown = renderReadmeMarkdown(minimal);
  assert.ok(!markdown.includes('How It Works'));
  assert.ok(!markdown.includes('Code Examples'));
  assert.ok(!markdown.includes('Project Structure'));
  assert.ok(!markdown.includes('Getting Started'));
});

test('a custom section order/renderer map is honored (the template hook)', () => {
  const markdown = renderReadmeMarkdown(model, ['title', 'overview'], {
    ...Object.fromEntries(V1_SECTION_ORDER.map(key => [key, () => ''])),
    title: m => `# ${m.title} (custom)`,
    overview: m => m.overview,
  });
  assert.equal(markdown.trim(), `# code-analysis (custom)\n\nAnalyzes a repository and generates its architecture.`.trim());
});

test('never rewrites a code example\'s source text', () => {
  const markdown = renderReadmeMarkdown(model);
  assert.ok(markdown.includes('```typescript\n' + model.codeExamples[0].code + '\n```'));
});


test('uses the showcase section order without a duplicated component catalog', () => {
  const markdown = renderReadmeMarkdown(model);
  assert.deepEqual([...markdown.matchAll(/^## (.+)$/gm)].map(match => match[1]), ['Overview', 'Architecture', 'How It Works', 'Implementation Highlights', 'Tech Stack', 'Project Structure', 'Getting Started']);
  assert.ok(!markdown.includes('Key Components'));
  assert.ok(!markdown.includes('90%'));
  assert.ok(!markdown.includes('3 files'));
  assert.match(markdown, /\| Layer \| Technologies \|/);
});

test('setup uses one working-directory change and one command block', () => {
  const markdown = renderReadmeMarkdown({ ...model, gettingStarted: { ...model.gettingStarted, installCommand: 'cd apps/web && npm install', scripts: [{ name: 'dev', command: 'cd apps/web && npm run dev' }, { name: 'build', command: 'cd apps/web && npm run build' }] } });
  assert.ok(markdown.includes('cd apps/web\nnpm install\nnpm run dev'));
  assert.equal((markdown.match(/cd apps\/web/g) ?? []).length, 1);
});

test('showcase stays bounded when a saved model contains many components and examples', () => {
  const examples = Array.from({ length: 15 }, (_, index) => ({ ...model.codeExamples[0], componentId: String(index), path: `src/${index}.ts`, code: `run(${index});\n` + 'process();\n'.repeat(20) }));
  const markdown = renderReadmeMarkdown({ ...model, codeExamples: examples, keyFlows: Array.from({ length: 12 }, (_, index) => ({ ...model.keyFlows[0], id: String(index) })) });
  assert.equal((markdown.match(/```typescript/g) ?? []).length, 4);
  assert.equal((markdown.match(/^\d+\. /gm) ?? []).length, 4);
  assert.ok(markdown.split(/\s+/).length < 650);
});
