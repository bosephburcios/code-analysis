import { createHash } from 'node:crypto';

export class CodeEvidenceError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status = status; }
}

export type TreeEntry = { path: string; sha: string; type: string; mode?: string; size?: number };

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function getCapped(url: string, limit: number, fetcher: typeof fetch): Promise<Buffer> {
  const signal = AbortSignal.timeout(20_000);
  const response = await fetcher(url, { signal, cache: 'no-store', redirect: 'error', headers: githubHeaders() });
  if (!response.ok) throw new CodeEvidenceError(response.status === 403 || response.status === 429
    ? 'GitHub rate limit or access restriction. Try loading the code again later.'
    : 'GitHub could not provide this source snapshot.', 502);
  const reader = response.body?.getReader();
  if (!reader) throw new CodeEvidenceError('GitHub returned an empty response.', 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new CodeEvidenceError('Source evidence exceeds the preview size limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

export async function fetchRepositoryTree(owner: string, name: string, treeSha: string, fetcher: typeof fetch = fetch): Promise<TreeEntry[]> {
  if (!/^[a-f0-9]{40}$/i.test(treeSha)) throw new CodeEvidenceError('Sync latest to capture a source snapshot for this repository.', 409);
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const bytes = await getCapped(`${base}/git/trees/${treeSha}?recursive=1`, 8_000_000, fetcher);
  const tree = JSON.parse(bytes.toString('utf8'));
  if (tree.truncated) throw new CodeEvidenceError('GitHub returned an incomplete tree; this source preview is unavailable.');
  return (tree.tree ?? []) as TreeEntry[];
}

export async function fetchRepositoryBlob(owner: string, name: string, sha: string, fetcher: typeof fetch = fetch): Promise<Buffer> {
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new CodeEvidenceError('This file cannot be previewed.');
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const bytes = await getCapped(`${base}/git/blobs/${sha}`, 150_000, fetcher);
  const blob = JSON.parse(bytes.toString('utf8'));
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > 100_000) throw new CodeEvidenceError('This file cannot be previewed.');
  const content = Buffer.from(blob.content, 'base64');
  if (content.length > 100_000 || content.includes(0)) throw new CodeEvidenceError('This file cannot be previewed.');
  const hash = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
  if (hash !== sha) throw new CodeEvidenceError('Source contents did not match the analyzed snapshot.', 502);
  return content;
}
