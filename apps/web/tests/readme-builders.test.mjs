import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBadges } from '../src/lib/readme/build-badges.ts';
import { buildTechStack } from '../src/lib/readme/build-tech-stack.ts';
import { buildProjectStructure } from '../src/lib/readme/build-project-structure.ts';
import {
  detectPackageManager, installCommandFor, findWorkspaceManifestCandidates,
  hasUsableScripts, extractScripts, extractEnvVarNames, buildGettingStarted,
} from '../src/lib/readme/build-getting-started.ts';

const analysis = {
  version: 1, treeSha: 'sha', fileCount: 10, ignoredFileCount: 0,
  languages: [{ name: 'TypeScript', count: 9, percentage: 90 }, { name: 'Other', count: 1, percentage: 10 }],
  tools: ['Next.js', 'Prisma', 'PostgreSQL', 'Tailwind CSS', 'Docker'],
};

test('buildBadges gives real linguist colors to languages and a consistent neutral to tools', () => {
  const badges = buildBadges(analysis);
  const ts = badges.find(b => b.label === 'TypeScript');
  assert.equal(ts.color, '3178c6');
  assert.equal(ts.logo, 'typescript');
  const next = badges.find(b => b.label === 'Next.js');
  assert.equal(next.color, '24292f');
  assert.ok(next.url.startsWith('https://img.shields.io/badge/'));
  // "Other" is never a badge — it isn't a real detected language.
  assert.ok(!badges.some(b => b.label === 'Other'));
});

test('buildTechStack groups tools by category and includes a Languages bucket', () => {
  const stack = buildTechStack(analysis);
  const categories = stack.map(entry => entry.category);
  assert.deepEqual(categories, ['Frontend', 'Data', 'Styling', 'Languages', 'Infrastructure']);
  assert.deepEqual(stack.find(entry => entry.category === 'Data').items.map(i => i.name), ['Prisma', 'PostgreSQL']);
});

test('buildProjectStructure selects meaningful directories and annotates their responsibility', () => {
  const tree = [
    { path: 'src/app/page.tsx', type: 'blob', sha: 'a' },
    { path: 'src/lib/util.ts', type: 'blob', sha: 'b' },
    { path: 'src/lib/other.ts', type: 'blob', sha: 'c' },
    { path: 'README.md', type: 'blob', sha: 'd' },
    { path: 'node_modules/x/index.js', type: 'blob', sha: 'e' },
  ];
  const entries = buildProjectStructure(tree);
  assert.deepEqual(entries, [
    { path: 'src/app', type: 'directory', description: 'Pages and API routes' },
    { path: 'src/lib', type: 'directory', description: 'Application logic and shared utilities' },
  ]);
});

test('detectPackageManager reads the lockfile, defaulting to npm', () => {
  assert.equal(detectPackageManager([{ path: 'pnpm-lock.yaml', type: 'blob' }]), 'pnpm');
  assert.equal(detectPackageManager([{ path: 'yarn.lock', type: 'blob' }]), 'yarn');
  assert.equal(detectPackageManager([]), 'npm');
  assert.equal(installCommandFor('pnpm'), 'pnpm install');
});

test('detectPackageManager and installCommandFor look inside a nested directory when given one', () => {
  assert.equal(detectPackageManager([{ path: 'apps/web/pnpm-lock.yaml', type: 'blob' }], 'apps/web'), 'pnpm');
  assert.equal(detectPackageManager([{ path: 'pnpm-lock.yaml', type: 'blob' }], 'apps/web'), 'npm');
  assert.equal(installCommandFor('npm', 'apps/web'), 'cd apps/web && npm install');
});

test('findWorkspaceManifestCandidates finds apps/*/package.json and packages/*/package.json', () => {
  const tree = [
    { path: 'apps/web/package.json', type: 'blob' },
    { path: 'packages/ui/package.json', type: 'blob' },
    { path: 'apps/web/src/package.json', type: 'blob' }, // too deep, excluded
  ];
  assert.deepEqual(findWorkspaceManifestCandidates(tree), ['apps/web/package.json', 'packages/ui/package.json']);
});

test('hasUsableScripts checks for a real dev/build/start/test script', () => {
  assert.equal(hasUsableScripts(JSON.stringify({ scripts: { dev: 'next dev' } })), true);
  assert.equal(hasUsableScripts(JSON.stringify({ scripts: { lint: 'eslint .' } })), false);
  assert.equal(hasUsableScripts(JSON.stringify({ workspaces: ['apps/*'] })), false);
  assert.equal(hasUsableScripts('not json'), false);
});

test('extractScripts only surfaces dev/build/start/test scripts that actually exist', () => {
  const pkg = JSON.stringify({ scripts: { dev: 'next dev', lint: 'eslint .' } });
  assert.deepEqual(extractScripts(pkg, 'npm'), [{ name: 'dev', command: 'npm run dev' }]);
  assert.deepEqual(extractScripts(pkg, 'pnpm'), [{ name: 'dev', command: 'pnpm dev' }]);
});

test('extractScripts prefixes each command with a cd when given a nested directory', () => {
  const pkg = JSON.stringify({ scripts: { dev: 'next dev' } });
  assert.deepEqual(extractScripts(pkg, 'npm', 'apps/web'), [{ name: 'dev', command: 'cd apps/web && npm run dev' }]);
});

test('extractEnvVarNames reads key names only, never values', () => {
  const content = '# comment\nDATABASE_URL=postgres://user:pass@host/db\nexport OLLAMA_MODEL=qwen3:8b\n\nEMPTY=\n';
  assert.deepEqual(extractEnvVarNames(content), ['DATABASE_URL', 'OLLAMA_MODEL', 'EMPTY']);
});

test('buildGettingStarted omits the section entirely with no usable manifest at all', () => {
  assert.equal(buildGettingStarted({ tree: [], scriptsPackageJson: null, scriptsDirectory: '', envVarNames: [] }), null);
});

test('buildGettingStarted assembles package manager, commands, and env vars from the root', () => {
  const result = buildGettingStarted({
    tree: [{ path: 'package-lock.json', type: 'blob' }],
    scriptsPackageJson: JSON.stringify({ scripts: { dev: 'next dev', build: 'next build' } }),
    scriptsDirectory: '',
    envVarNames: ['DATABASE_URL'],
  });
  assert.equal(result.packageManager, 'npm');
  assert.equal(result.installCommand, 'npm install');
  assert.deepEqual(result.scripts, [{ name: 'dev', command: 'npm run dev' }, { name: 'build', command: 'npm run build' }]);
  assert.deepEqual(result.envVars, ['DATABASE_URL']);
});

test('buildGettingStarted prefixes commands with cd when the manifest is nested (CodeMap-shaped repo)', () => {
  const result = buildGettingStarted({
    tree: [{ path: 'apps/web/package-lock.json', type: 'blob' }],
    scriptsPackageJson: JSON.stringify({ scripts: { dev: 'next dev' } }),
    scriptsDirectory: 'apps/web',
    envVarNames: [],
  });
  assert.equal(result.packageManager, 'npm');
  assert.equal(result.installCommand, 'cd apps/web && npm install');
  assert.deepEqual(result.scripts, [{ name: 'dev', command: 'cd apps/web && npm run dev' }]);
});


test('hero badges use up to six detected technologies, never percentages', () => {
  const badges = buildBadges({ ...analysis, tools: [...analysis.tools, 'React Flow', 'Ollama', 'React', 'Supabase'] });
  assert.equal(badges.length, 6);
  assert.deepEqual(badges.map(badge => badge.label), ['Next.js', 'TypeScript', 'Prisma', 'PostgreSQL', 'React Flow', 'Ollama']);
  assert.ok(badges.every(badge => badge.value === '' && !badge.url.includes('%25')));
});
