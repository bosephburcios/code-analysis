import ts from 'typescript';

export type CodeExcerpt = {
  label: string;
  startLine: number;
  endLine: number;
  code: string;
  highlightedLines: number[];
  truncated: boolean;
  tokens: { text: string; kind: 'plain' | 'keyword' | 'string' | 'comment' | 'number' }[][];
};

export function canInspectCode(path: string) {
  return path.length <= 1000 && !path.split('/').some(part => !part || part === '..' || part === '.')
    && !/(?:^|\/)(?:\.env[^/]*|node_modules|generated|dist|build|\.git|secrets?)(?:\/|$)/i.test(path)
    && /(?:\.[cm]?[jt]sx?|\.py|\.prisma|\.sql|\.json|\.ya?ml|\.toml)$/.test(path);
}

export function formatCodeExcerpt(code: string, label: string, startLine: number, highlightedLines: number[] = [], truncated = false, isScript = true): CodeExcerpt {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code);
  const tokens: CodeExcerpt['tokens'] = [[]];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const kind = !isScript ? 'plain' : token >= ts.SyntaxKind.FirstKeyword && token <= ts.SyntaxKind.LastKeyword ? 'keyword'
      : [ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(token) ? 'string'
      : [ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(token) ? 'comment'
      : token === ts.SyntaxKind.NumericLiteral ? 'number' : 'plain';
    scanner.getTokenText().split('\n').forEach((text, index) => {
      if (index) tokens.push([]);
      if (text) tokens[tokens.length - 1].push({ text, kind });
    });
  }
  return { label, startLine, endLine: startLine + code.split('\n').length - 1, code, tokens, highlightedLines, truncated };
}
