export const repositorySections = [
  { id: 'architecture', label: 'Architecture' },
  { id: 'overview', label: 'Overview' },
  { id: 'components', label: 'Components' },
  { id: 'readme', label: 'README' },
] as const;
export type RepositorySection = typeof repositorySections[number]['id'];

export function repositoryIdFromPath(pathname: string) {
  return /^\/repos\/([^/]+)(?:\/|$)/.exec(pathname)?.[1] ?? null;
}

export function sectionAtScroll(sections: { id: RepositorySection; top: number }[], atBottom: boolean): RepositorySection {
  if (atBottom && sections.length) return sections[sections.length - 1].id;
  return sections.filter(section => section.top <= 120).at(-1)?.id ?? 'architecture';
}
