import ts from 'typescript';
import { formatCodeExcerpt } from './code-excerpts.ts';
import { extractSourceFacts } from './source-facts.ts';
import type { EvidenceContext, EvidenceItem, EvidenceKind } from './evidence-types.ts';

// Scores describe static relevance, not model confidence.
export function selectFileEvidence(path: string, content: string, context: EvidenceContext, purpose?: 'readme'): EvidenceItem[] {
  const file = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, /\.tsx$/.test(path) ? ts.ScriptKind.TSX : /\.jsx$/.test(path) ? ts.ScriptKind.JSX : ts.ScriptKind.TS);
  const script = /\.[cm]?[jt]sx?$/.test(path);
  const facts = script ? extractSourceFacts(path, content) : null;
  const items: EvidenceItem[] = [];
  const at = (position: number) => file.getLineAndCharacterOfPosition(position).line + 1;
  const add = (kind: EvidenceKind, start: number, end: number, label: string, score: number, reasons: string[], extra: Partial<EvidenceItem> = {}) => {
    const exact = content.slice(start, end).replace(/\r\n/g, '\n');
    const limit = purpose === 'readme' ? 15 : kind === 'data_model' ? 40 : 24;
    const lines = exact.split('\n');
    if (!exact.trim() || lines.some(line => line.length > 1500)) return;
    const code = lines.slice(0, limit).join('\n');
    items.push({ ...formatCodeExcerpt(code, label, at(start), [at(start)], lines.length > limit, script),
      kind, path, score, reasons, showCode: context.kind !== 'feature', ...extra });
  };
  const calls = new Map<number, ts.CallExpression>();
  const imports: ts.ImportDeclaration[] = [];
  const declarations: ts.Node[] = [];
  const sdkNames = new Set<string>();
  const root = (expression: ts.Expression): string => ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? root(expression.expression) : '';
  function collect(node: ts.Node) {
    if (ts.isCallExpression(node)) calls.set(node.getStart(file), node);
    if (ts.isImportDeclaration(node)) imports.push(node);
    if (ts.isVariableDeclaration(node)) declarations.push(node);
    ts.forEachChild(node, collect);
  }
  if (script) collect(file);
  for (const imported of facts?.imports ?? []) if (context.packages.some(pkg => imported.specifier === pkg || pkg.endsWith('/') && imported.specifier.startsWith(pkg))) {
    imported.names.forEach(name => sdkNames.add(name));
  }
  for (const node of declarations) if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
    && (ts.isNewExpression(node.initializer) || ts.isCallExpression(node.initializer)) && sdkNames.has(root(node.initializer.expression))) sdkNames.add(node.name.text);

  function callRange(start: number, end: number) {
    let node: ts.Node | undefined = calls.get(start);
    if (!node) return { start, end };
    // Include a direct assignment/return, but never climb into a handler or enclosing callback.
    if (ts.isAwaitExpression(node.parent)) node = node.parent;
    if (ts.isReturnStatement(node.parent) || ts.isExpressionStatement(node.parent)) node = node.parent;
    else if (ts.isVariableDeclaration(node.parent) && node.parent.initializer === node
      && ts.isVariableDeclarationList(node.parent.parent) && node.parent.parent.declarations.length === 1
      && ts.isVariableStatement(node.parent.parent.parent)) node = node.parent.parent.parent;
    return { start: node.getStart(file), end: node.end };
  }
  const integration = context.kind === 'external_api' || context.kind === 'ai_service';
  for (const request of facts?.requests ?? []) {
    const cited = context.lines.includes(request.line);
    let host = '';
    try { host = new URL(request.url).hostname; } catch { /* Local API paths have no host. */ }
    if (integration && !(context.hosts.length ? context.hosts.includes(host) : cited)) continue;
    if (!integration && !context.definesComponent) continue;
    if (context.kind === 'database') continue;
    const range = callRange(request.start, request.end);
    const kind = context.kind === 'ai_service' ? 'ai_service' : request.url.startsWith('/api/') ? 'ui_component' : 'external_api';
    add(kind, range.start, range.end, `${request.method} ${request.url}`, 10 + (cited ? 4 : 0), ['Direct component reference +5', 'API call +5', ...(cited ? ['Establishes graph edge +4'] : [])], { method: request.method, endpoint: request.url });
  }
  for (const operation of facts?.database ?? []) {
    if (integration || !context.definesComponent && context.kind !== 'database') continue;
    if (context.models.length && !context.models.some(model => model.toLowerCase() === operation.model.toLowerCase())) continue;
    // Query files were chosen through this database's data edges, not global filename matching.
    const range = callRange(operation.start, operation.end);
    const symbol = `${operation.client}.${operation.model}.${operation.operation}()`;
    add('database', range.start, range.end, symbol, 9 + (context.lines.includes(operation.line) ? 4 : 0), ['Direct component reference +5', 'Database operation +4'], { symbol });
  }
  for (const call of calls.values()) {
    const name = call.expression.getText(file);
    const sdk = integration && sdkNames.has(root(call.expression));
    const linked = context.names.some(symbol => name === symbol || name.startsWith(`${symbol}.`));
    if (!sdk && (!linked || integration || context.kind === 'database')) continue;
    if (items.some(item => item.startLine <= at(call.getStart(file)) && item.endLine >= at(call.end))) continue;
    const range = callRange(call.getStart(file), call.end);
    add(sdk ? context.kind : 'dependency', range.start, range.end, `${name}()`, sdk ? 10 : 9,
      ['Direct component reference +5', sdk ? 'Provider/client invocation +5' : 'Establishes graph edge +4'], { symbol: name });
  }
  for (const declaration of imports) {
    const imported = facts?.imports.find(item => ts.isStringLiteral(declaration.moduleSpecifier) && item.specifier === declaration.moduleSpecifier.text);
    if (!imported || !imported.names.some(name => integration ? sdkNames.has(name) : context.names.includes(name))) continue;
    add('dependency', declaration.getStart(file), declaration.end, `Imports ${imported.specifier}`, 1, ['Import only +1']);
  }
  function definitions(node: ts.Node) {
    const exported = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node))) {
      const declaration = ts.isFunctionDeclaration(node) ? node : node.declarationList.declarations[0];
      const name = declaration?.name?.getText(file) ?? 'default';
      const initializer = declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
      const body = ts.isFunctionDeclaration(node) ? node.body : initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ? initializer.body : undefined;
      const signatureEnd = body ? body.getStart(file) + (ts.isBlock(body) ? 1 : 0) : node.end;
      const route = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name);
      if (context.definesComponent && !integration && context.kind !== 'database' && (route || context.kind !== 'api_route')) {
        add(route ? 'api_route' : context.kind === 'ui_component' ? 'ui_component' : 'feature', node.getStart(file), purpose === 'readme' && !route ? node.end : signatureEnd,
          route ? `${name} route signature` : name, 10, ['Direct component reference +5', 'Defines component +5'], { symbol: name, showCode: context.kind !== 'feature' });
      }
    }
    ts.forEachChild(node, definitions);
  }
  if (script) definitions(file);
  if (/\.prisma$/.test(path) && context.kind === 'database') {
    // Token positions exclude commented-out models and braces inside quoted strings.
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, content);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (scanner.getTokenText() !== 'model') continue;
      const start = scanner.getTokenPos();
      scanner.scan(); const name = scanner.getTokenText();
      if (scanner.scan() !== ts.SyntaxKind.OpenBraceToken) continue;
      let depth = 1;
      while (depth && scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
        if (scanner.getToken() === ts.SyntaxKind.OpenBraceToken) depth++;
        if (scanner.getToken() === ts.SyntaxKind.CloseBraceToken) depth--;
      }
      if (!depth && (!context.models.length || context.models.includes(name))) add('data_model', start, scanner.getTextPos(), `model ${name}`, 10, ['Direct component reference +5', 'Defines model +5'], { symbol: name });
    }
  }
  return items;
}

export function rankEvidence(items: EvidenceItem[], kind: EvidenceKind): EvidenceItem[] {
  const sorted = [...items].sort((a, b) => b.score - a.score || a.code.length - b.code.length || a.path.localeCompare(b.path) || a.startLine - b.startLine);
  const chosen: EvidenceItem[] = [];
  const add = (item: EvidenceItem | undefined) => {
    if (!item || chosen.some(other => other.path === item.path && (kind === 'feature' || other.startLine === item.startLine && other.code === item.code))) return;
    // Repeated wrappers for the same operation add little architectural evidence.
    if (chosen.some(other => other.kind === item.kind && other.label === item.label)) return;
    chosen.push(item);
  };
  if (kind === 'database') {
    sorted.filter(item => item.kind === 'database').slice(0, 2).forEach(add);
    add(sorted.find(item => item.kind === 'data_model'));
  } else if (kind === 'api_route') add(sorted.find(item => item.kind === 'api_route'));
  else if (kind === 'ui_component') add(sorted.find(item => item.kind === 'ui_component' && !item.endpoint));
  else if (kind === 'feature') sorted.filter(item => item.kind === 'feature').forEach(item => { if (chosen.length < 4) add(item); });
  for (const item of sorted) { if (chosen.length === 4) break; add(item); }
  return chosen;
}
