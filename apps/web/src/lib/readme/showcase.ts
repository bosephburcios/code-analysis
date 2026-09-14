import type { GeneratedReadme, ReadmeGettingStarted, ReadmeProjectStructureEntry } from './types.ts';
import { badgeUrl } from '../tech-badges.ts';

export function concise(text: string, maxWords = 45) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  const fragment = words.slice(0, maxWords).join(' ');
  const sentence = fragment.match(/^([\s\S]*[.!?])\s/);
  return sentence?.[1] ?? `${fragment.replace(/[,:;]$/, '')}…`;
}

// Apply the same presentation limits to saved older models, previews, and exports.
export function showcaseModel(model: GeneratedReadme): GeneratedReadme {
  const codes = new Set<string>();
  const paths = new Set<string>();
  return { ...model,
    tagline: concise(model.tagline, 30), overview: concise(model.overview, 130),
    badges: model.badges.filter((badge, index, all) => all.findIndex(other => other.label === badge.label) === index).slice(0, 6)
      .map(badge => ({ ...badge, value: '', url: badgeUrl(badge.label, '', badge.color, badge.logo) })),
    architecture: { ...model.architecture, description: concise(model.architecture.description ?? '', 55) },
    keyFlows: model.keyFlows.slice(0, 4).map(flow => ({ ...flow, description: concise(flow.description, 35) })),
    codeExamples: model.codeExamples.filter(example => {
      const code = example.code.replace(/\s+/g, '');
      if (!code || paths.has(example.path) || codes.has(code) || /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+\([^)]*\)(?:\s*:\s*[^{}]+)?\s*\{?\s*\}?\s*$/.test(example.code)) return false;
      codes.add(code); paths.add(example.path); return true;
    }).slice(0, 4).map(example => ({ ...example,
      description: concise(example.description ?? model.components.find(component => component.id === example.componentId)?.description ?? '', 40),
      code: example.code.split('\n').slice(0, 15).join('\n'), endLine: example.startLine + Math.min(example.code.split('\n').length, 15) - 1,
      truncated: example.truncated || example.code.split('\n').length > 15,
    })),
    projectStructure: model.projectStructure.filter(entry => entry.type === 'directory').slice(0, 8),
  };
}

export function structureText(entries: ReadmeProjectStructureEntry[]) {
  const directories = entries.filter(entry => entry.type === 'directory').slice(0, 8);
  if (!directories.length) return '';
  const parts = directories.map(entry => entry.path.split('/'));
  let shared = 0;
  while (parts.length > 1 && parts.every(path => path.length > shared + 1 && path[shared] === parts[0][shared])) shared++;
  const prefix = parts[0].slice(0, shared).join('/');
  return [prefix ? `${prefix}/` : '.', ...directories.map((entry, index) =>
    `${index === directories.length - 1 ? '└──' : '├──'} ${entry.path.slice(prefix ? prefix.length + 1 : 0)}/${entry.description ? `  # ${entry.description}` : ''}`)].join('\n');
}

export function setupCommands(section: NonNullable<ReadmeGettingStarted>) {
  const directory = /^cd (.*?) && /.exec(section.installCommand)?.[1];
  const strip = (command: string) => directory ? command.replace(`cd ${directory} && `, '') : command;
  const dev = section.scripts.find(script => script.name === 'dev');
  const start = section.scripts.find(script => script.name === 'start');
  const build = section.scripts.find(script => script.name === 'build');
  const commands = dev ? [dev] : [build, start].filter((script): script is NonNullable<typeof script> => !!script);
  return [...(directory ? [`cd ${directory}`] : []), strip(section.installCommand), ...commands.map(script => strip(script.command))].join('\n');
}
