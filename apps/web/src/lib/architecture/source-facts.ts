import ts from 'typescript';

export type SourceFacts = {
  imports: { specifier: string; names: string[] }[];
  exports: string[];
  requests: { url: string; method: string; line: number; start: number; end: number }[];
  database: { client: string; model: string; operation: string; line: number; start: number; end: number }[];
  calls: string[];
  client: boolean;
};

// Parse syntax only. Repository code is never imported, evaluated, or executed.
export function extractSourceFacts(path: string, content: string): SourceFacts {
  const file = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, /\.tsx$/.test(path) ? ts.ScriptKind.TSX : /\.jsx$/.test(path) ? ts.ScriptKind.JSX : ts.ScriptKind.TS);
  const facts: SourceFacts = { imports: [], exports: [], requests: [], database: [], calls: [], client: false };
  const values = new Map<string, ts.Expression>();
  const ambiguous = new Set<string>();
  const functions: ts.FunctionDeclaration[] = [];
  const line = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const chain = (node: ts.Expression): string => ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? `${chain(node.expression)}.${node.name.text}` : '';
  function literal(node: ts.Expression, seen = new Set<string>()): string {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return literal(node.expression, seen);
    if (ts.isIdentifier(node) && values.has(node.text) && !ambiguous.has(node.text) && !seen.has(node.text)) {
      for (let scope: ts.Node | undefined = node.parent; scope; scope = scope.parent) {
        if (ts.isFunctionLike(scope) && scope.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === node.text)) return '';
      }
      return literal(values.get(node.text)!, new Set([...seen, node.text]));
    }
    if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => `${literal(span.expression, seen) || '{dynamic}'}${span.literal.text}`).join('');
    if (ts.isBinaryExpression(node)) {
      if ([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) return literal(node.right, seen);
      if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) return literal(node.left, seen) + literal(node.right, seen);
    }
    // URL normalization helpers do not change the host/path used as evidence.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'replace') return literal(node.expression.expression, seen);
    return '';
  }
  function collect(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) functions.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (values.has(node.name.text)) ambiguous.add(node.name.text);
      values.set(node.name.text, node.initializer);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
      const names: string[] = [];
      if (node.importClause?.name) names.push(node.importClause.name.text);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.filter(item => !item.isTypeOnly).map(item => item.name.text));
      if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name.text);
      facts.imports.push({ specifier: node.moduleSpecifier.text, names });
    }
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'use client') facts.client = true;
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) { if (node.name) facts.exports.push(node.name.text); }
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) facts.exports.push(declaration.name.text);
    }
    ts.forEachChild(node, collect);
  }
  collect(file);
  const requestHelpers = new Set<string>();
  for (const fn of functions) {
    function findFetch(node: ts.Node) {
      if (ts.isCallExpression(node) && ['fetch', 'fetcher'].includes(chain(node.expression))) requestHelpers.add(fn.name!.text);
      ts.forEachChild(node, findFetch);
    }
    findFetch(fn.body!);
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const name = chain(node.expression);
      if (name) facts.calls.push(name);
      const first = node.arguments[0];
      // Fetch-like calls must carry a statically identifiable HTTP URL or API path.
      if (first && /(?:^|\.)(?:fetch|fetcher|get|post|put|patch|delete)$/.test(name)) {
        let url = literal(first).split('?')[0].slice(0, 500);
        if (url.startsWith('/git/') && requestHelpers.has(name) && values.has('base')) {
          const base = literal(values.get('base')!);
          if (base.startsWith('https://api.github.com/')) url = base + url;
        }
        if (/^(?:https?:\/\/|\/api\/)/.test(url)) {
          let method = /\.(post|put|patch|delete)$/.exec(name)?.[1].toUpperCase() ?? 'GET';
          const options = node.arguments[1];
          if (options && ts.isObjectLiteralExpression(options)) for (const property of options.properties) {
            if (ts.isPropertyAssignment(property) && property.name.getText(file).replace(/['"]/g, '') === 'method') method = literal(property.initializer) || 'UNKNOWN';
          }
          facts.requests.push({ url, method, line: line(node), start: node.getStart(file), end: node.end });
        }
      }
      const db = /^([\w$]+)\.([\w$]+)\.(findMany|findFirst|findUnique|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)$/.exec(name);
      if (db) {
        const isClient = (name: string) => facts.imports.some(item => /prisma/.test(item.specifier) && item.names.includes(name));
        let client = isClient(db[1]) ? db[1] : '';
        // Transaction callback delegates belong to the same imported Prisma client.
        for (let scope: ts.Node | undefined = node.parent; !client && scope; scope = scope.parent) {
          if ((ts.isArrowFunction(scope) || ts.isFunctionExpression(scope)) && ts.isCallExpression(scope.parent)
            && scope.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === db[1])) {
            const transaction = /^([\w$]+)\.\$transaction$/.exec(chain(scope.parent.expression));
            if (transaction && isClient(transaction[1])) client = transaction[1];
          }
        }
        if (client) facts.database.push({ client, model: db[2], operation: db[3], line: line(node), start: node.getStart(file), end: node.end });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  facts.exports = [...new Set(facts.exports)].slice(0, 12);
  facts.calls = [...new Set(facts.calls)];
  return facts;
}
