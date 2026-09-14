import type { GeneratedReadme, ReadmeSectionKey } from './types.ts';
import { showcaseModel, structureText, setupCommands } from './showcase.ts';

type SectionRenderer = (model: GeneratedReadme) => string;
export const V1_SECTION_ORDER: ReadmeSectionKey[] = ['hero', 'overview', 'architecture', 'keyFlows', 'implementationHighlights', 'techStack', 'projectStructure', 'gettingStarted'];
const html = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const fence = (code: string, language = '') => {
  const delimiter = '`'.repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map(match => match[0].length + 1)));
  return `${delimiter}${language}\n${code}\n${delimiter}`;
};
const language = (path: string) => (path.split('.').at(-1) ?? '').replace(/^(ts|tsx)$/, 'typescript').replace(/^(js|jsx|mjs|cjs)$/, 'javascript');
const highlights: SectionRenderer = model => model.codeExamples.length ? `## Implementation Highlights\n\n${model.codeExamples.map(example =>
  `### ${example.componentLabel}\n\n${example.description ? `${example.description}\n\n` : ''}<sub>${html(example.path)}:${example.startLine}–${example.endLine}</sub>\n\n${fence(example.code, language(example.path))}${example.truncated ? '\n\n<sub>Excerpt; see the source file for the full implementation.</sub>' : ''}`
).join('\n\n')}` : '';

export const DEFAULT_SECTION_RENDERERS: Record<ReadmeSectionKey, SectionRenderer> = {
  hero: model => [`# ${model.title}`, model.tagline, model.badges.map(badge => `![${badge.label}](${badge.url})`).join(' ')].filter(Boolean).join('\n\n'),
  title: model => `# ${model.title}`,
  tagline: model => model.tagline,
  badges: model => model.badges.map(badge => `![${badge.label}](${badge.url})`).join(' '),
  overview: model => model.overview ? `## Overview\n\n${model.overview}` : '',
  architecture: model => `## Architecture\n\n<p align="center">\n  <img src="./${html(model.architecture.imagePath)}" alt="${html(model.title)} architecture" width="100%" />\n</p>${model.architecture.description ? `\n\n${model.architecture.description}` : ''}`,
  keyFlows: model => model.keyFlows.length ? `## How It Works\n\n${model.keyFlows.map((flow, index) => `${index + 1}. **${flow.title}** — ${flow.description}`).join('\n')}` : '',
  implementationHighlights: highlights,
  // Old section identifiers stay compatible with saved/custom templates.
  components: () => '',
  codeExamples: highlights,
  techStack: model => model.techStack.length ? `## Tech Stack\n\n| Layer | Technologies |\n| --- | --- |\n${model.techStack.map(entry => `| ${cell(entry.category)} | ${entry.items.map(item => cell(item.name)).join(', ')} |`).join('\n')}` : '',
  projectStructure: model => model.projectStructure.length ? `## Project Structure\n\n${fence(structureText(model.projectStructure), 'text')}` : '',
  gettingStarted: model => model.gettingStarted ? `## Getting Started\n\n${fence(setupCommands(model.gettingStarted), 'bash')}${model.gettingStarted.envVars.length ? `\n\nConfigure the variables listed in the repository’s environment template: ${model.gettingStarted.envVars.map(name => `\`${name}\``).join(', ')}.` : ''}` : '',
};

export function renderReadmeMarkdown(model: GeneratedReadme, order: ReadmeSectionKey[] = V1_SECTION_ORDER, renderers: Partial<Record<ReadmeSectionKey, SectionRenderer>> = DEFAULT_SECTION_RENDERERS) {
  const presentation = showcaseModel(model);
  return order.map(key => renderers[key]?.(presentation)).filter(Boolean).join('\n\n') + '\n';
}
