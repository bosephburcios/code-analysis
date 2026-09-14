import type { ArchitectureGraph } from './types.ts';
import type { SemanticNode } from './semantic-schema.ts';
import type { ComponentEvidence } from './evidence-types.ts';
import { componentEvidencePlan } from './evidence-plan.ts';
import { selectFileEvidence, rankEvidence } from './select-evidence.ts';
import { canInspectCode } from './code-excerpts.ts';
import { CodeEvidenceError, fetchRepositoryTree, fetchRepositoryBlob, type TreeEntry } from './fetch-repository-source.ts';

// rankEvidence never surfaces more than 4 final items regardless of how many
// files are scanned, and componentEvidencePlan's file list is already
// priority-sorted — 6 gives enough breadth for multi-file "feature"
// components without materially increasing worst-case latency.
export const EVIDENCE_FILE_CAP = 6;

export async function loadComponentEvidence(input: {
  owner: string; name: string; treeSha: string; graph: ArchitectureGraph; node: SemanticNode; tree?: TreeEntry[]; purpose?: 'readme';
}, fetcher: typeof fetch = fetch): Promise<ComponentEvidence> {
  const { kind, files } = componentEvidencePlan(input.graph, input.node);
  const tree = input.tree ?? await fetchRepositoryTree(input.owner, input.name, input.treeSha, fetcher);
  const byPath = new Map(tree.map(entry => [entry.path, entry]));
  const candidates = files.filter(([path]) => canInspectCode(path)).slice(0, EVIDENCE_FILE_CAP);
  const warnings: string[] = [];

  const results = await Promise.allSettled(candidates.map(async ([path, context]) => {
    const entry = byPath.get(path);
    if (!entry || entry.type !== 'blob' || entry.mode === '120000' || (entry.size ?? 0) > 100_000) {
      warnings.push(`Skipped ${path}: not available in the analyzed snapshot.`);
      return [];
    }
    const bytes = await fetchRepositoryBlob(input.owner, input.name, entry.sha, fetcher);
    return selectFileEvidence(path, bytes.toString('utf8'), context, input.purpose);
  }));

  const items = results.flatMap(result => {
    if (result.status === 'fulfilled') return result.value;
    warnings.push(`Skipped a file: ${result.reason instanceof Error ? result.reason.message : 'fetch failed.'}`);
    return [];
  });
  const scanned = results.filter(result => result.status === 'fulfilled').length;

  return {
    componentId: input.node.id,
    kind,
    treeSha: input.treeSha,
    totalReferences: items.length,
    items: input.purpose === 'readme' ? items.sort((a, b) => b.score - a.score).slice(0, 24) : rankEvidence(items, kind),
    coverage: { scanned, total: files.length, complete: scanned === candidates.length && candidates.length === files.length },
    warnings,
  };
}

export { CodeEvidenceError };
