import type { Analysis } from '../repository-analysis.ts';
import type { ReadmeTechStackEntry } from './types.ts';

const layers: Record<string, string> = {
  'Next.js': 'Frontend', React: 'Frontend', 'React Flow': 'Frontend', Vue: 'Frontend', Svelte: 'Frontend', Vite: 'Frontend',
  'Next.js Route Handlers': 'Backend', Express: 'Backend', FastAPI: 'Backend', Django: 'Backend', Flask: 'Backend',
  Prisma: 'Data', PostgreSQL: 'Data', Supabase: 'Data', Redis: 'Data', MongoDB: 'Data', SQLite: 'Data',
  Ollama: 'AI', 'OpenAI API': 'AI', 'OpenAI': 'AI', Anthropic: 'AI',
  'Tailwind CSS': 'Styling', Docker: 'Infrastructure', Terraform: 'Infrastructure', 'GitHub Actions': 'Infrastructure', 'AWS SDK': 'Infrastructure',
  TypeScript: 'Languages', JavaScript: 'Languages',
};
export function buildTechStack(analysis: Analysis): ReadmeTechStackEntry[] {
  const grouped = new Map<string, Set<string>>();
  const names = [...new Set([...analysis.tools, ...analysis.languages.filter(language => language.name !== 'Other' && language.percentage >= 10).slice(0, 2).map(language => language.name)])];
  for (const name of names) {
    const category = layers[name] ?? (analysis.languages.some(language => language.name === name) ? 'Languages' : 'Tools');
    if (!grouped.has(category)) grouped.set(category, new Set());
    grouped.get(category)!.add(name);
  }
  return ['Frontend', 'Backend', 'Data', 'AI', 'Styling', 'Languages', 'Infrastructure', 'Tools'].flatMap(category => {
    const names = grouped.get(category);
    return names ? [{ category, items: [...names].slice(0, 6).map(name => ({ name })) }] : [];
  });
}
