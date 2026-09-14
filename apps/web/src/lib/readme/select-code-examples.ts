import ts from "typescript";
import type { SemanticNode } from "../architecture/semantic-schema.ts";
import type { ComponentEvidence } from "../architecture/evidence-types.ts";
import type { ReadmeCodeExample } from "./types.ts";
import { readmeRole } from "./component-role.ts";

const ROLE_PRIORITY: Record<string, number> = {
  processor: 0,
  api: 1,
  service: 2,
  data_access: 3,
  external: 4,
  database: 5,
  ui: 6,
  infrastructure: 7,
};
export function selectCodeExampleCandidates(
  semantic: { nodes: SemanticNode[] },
  limit = 10,
): SemanticNode[] {
  return [...semantic.nodes]
    .sort(
      (a, b) =>
        (ROLE_PRIORITY[readmeRole(a)] ?? 8) -
          (ROLE_PRIORITY[readmeRole(b)] ?? 8) || b.confidence - a.confidence,
    )
    .slice(0, limit);
}

export function demonstratesBehavior(path: string, code: string) {
  if (!/\.[cm]?[jt]sx?$/.test(path))
    return /\b(?:SELECT|INSERT|UPDATE|DELETE)\b|\b(?:await|for|if)\b/.test(
      code,
    );
  const source = ts.createSourceFile(
    path,
    code,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let behavior = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isForOfStatement(node) ||
      ts.isForStatement(node)
    )
      behavior = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return behavior;
}

export function toReadmeCodeExample(
  node: SemanticNode,
  evidence: ComponentEvidence,
  maxLines = 15,
): ReadmeCodeExample | null {
  const ranked = evidence.items
    .flatMap((item) => {
      const code = item.code.split("\n").slice(0, maxLines).join("\n");
      if (
        (/^\s*import\b/.test(code) && !code.includes("\n")) ||
        !demonstratesBehavior(item.path, code)
      )
        return [];
      const lines = code.split("\n").length;
      const behavior =
        /fetch\(|fetcher\(|\.upsert\(|\.create\(|\.update\(|generate|analy[sz]e|build.*[Gg]raph/.test(
          code,
        )
          ? 5
          : 0;
      return [
        {
          item,
          code,
          rank:
            (item.score ?? 0) +
            behavior +
            (lines >= 5 && lines <= 15 ? 5 : 0) -
            (item.truncated ? 2 : 0),
        },
      ];
    })
    .sort((a, b) => b.rank - a.rank || a.code.length - b.code.length);
  const best = ranked[0];
  if (!best) return null;
  const { item, code } = best;
  return {
    componentId: node.id,
    componentLabel: node.label,
    description: node.description,
    path: item.path,
    startLine: item.startLine,
    endLine: item.startLine + code.split("\n").length - 1,
    code,
    truncated: item.truncated || code !== item.code,
  };
}
