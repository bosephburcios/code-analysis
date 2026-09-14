import type { Analysis } from '../repository-analysis.ts';
import type { ReadmeBadge } from './types.ts';
import { colorFor, SIMPLE_ICON_SLUGS, badgeUrl } from '../tech-badges.ts';

const PRIORITY = ['Next.js', 'TypeScript', 'Prisma', 'PostgreSQL', 'React Flow', 'Ollama', 'React', 'Python', 'FastAPI', 'Vue', 'Svelte', 'Django', 'Docker', 'Tailwind CSS'];
export function buildBadges(analysis: Analysis): ReadmeBadge[] {
  const names = [...new Set([...analysis.tools.filter(tool => tool !== 'Next.js Route Handlers'), ...analysis.languages.filter(language => language.name !== 'Other' && language.percentage >= 1).map(language => language.name)])];
  const rank = (name: string) => PRIORITY.includes(name) ? PRIORITY.indexOf(name) : PRIORITY.length;
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, 6).map(name => {
    const color = analysis.languages.some(language => language.name === name) ? colorFor(name).replace('#', '') : '24292f';
    const logo = SIMPLE_ICON_SLUGS[name];
    return { label: name, value: '', color, logo, url: badgeUrl(name, '', color, logo) };
  });
}
