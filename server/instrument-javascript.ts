import { parse } from '@babel/parser';
import traverseImport, { type NodePath } from '@babel/traverse';
import generateImport from '@babel/generator';
import * as t from '@babel/types';

// Babel publishes CommonJS entry points; normalize them for both tsx development and Node ESM builds.
const traverse = ((traverseImport as unknown as { default?: typeof traverseImport }).default ?? traverseImport) as typeof traverseImport;
const generate = ((generateImport as unknown as { default?: typeof generateImport }).default ?? generateImport) as typeof generateImport;

export class UnsupportedJavaScriptFeature extends Error {}

function safeRead(name: string) {
  return t.callExpression(
    t.arrowFunctionExpression(
      [],
      t.blockStatement([
        t.tryStatement(
          t.blockStatement([t.returnStatement(t.identifier(name))]),
          t.catchClause(t.identifier('_traceReadError'), t.blockStatement([t.returnStatement(t.identifier('undefined'))])),
        ),
      ]),
    ),
    [],
  );
}

function bindingsGetter(path: NodePath) {
  const names = Object.keys(path.scope.getAllBindings())
    .filter((name) => name !== '__trace' && /^[$A-Z_a-z][$\w]*$/u.test(name))
    .slice(0, 80);

  return t.arrowFunctionExpression(
    [],
    t.objectExpression(names.map((name) => t.objectProperty(t.identifier(name), safeRead(name)))),
  );
}

function traceCall(method: string, line: number, getter: t.ArrowFunctionExpression, extra: t.Expression[] = []) {
  const statement = t.expressionStatement(
    t.callExpression(t.memberExpression(t.identifier('__trace'), t.identifier(method)), [
      t.numericLiteral(line),
      ...extra,
      getter,
    ]),
  );
  (statement as t.ExpressionStatement & { __traceGenerated?: boolean }).__traceGenerated = true;
  return statement;
}

function statementEventType(node: t.Statement): string {
  if (t.isVariableDeclaration(node)) return 'declaration';
  if (t.isForStatement(node) || t.isForInStatement(node) || t.isForOfStatement(node) || t.isWhileStatement(node) || t.isDoWhileStatement(node)) return 'loop';
  if (t.isExpressionStatement(node) && t.isAssignmentExpression(node.expression)) return 'assignment';
  if (t.isExpressionStatement(node) && t.isCallExpression(node.expression)) {
    const callee = node.expression.callee;
    if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && ['push', 'pop', 'shift', 'unshift', 'splice', 'set', 'delete', 'add', 'clear', 'sort', 'reverse'].includes(callee.property.name)) {
      return 'mutation';
    }
  }
  return 'line';
}

function isGeneratedTraceStatement(node: t.Statement) {
  return t.isExpressionStatement(node) && t.isCallExpression(node.expression) &&
    t.isMemberExpression(node.expression.callee) && t.isIdentifier(node.expression.callee.object, { name: '__trace' });
}

function functionName(path: NodePath<t.Function>) {
  if (path.isFunctionDeclaration() && path.node.id) return path.node.id.name;
  if (path.isFunctionExpression() && path.node.id) return path.node.id.name;
  const parent = path.parentPath;
  if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) return parent.node.id.name;
  if (parent?.isObjectProperty() && t.isIdentifier(parent.node.key)) return parent.node.key.name;
  return '<anonymous>';
}

/**
 * Instruments only synchronous script code. Original source locations are retained on generated
 * trace calls; the container never receives an uninstrumented fallback trace.
 */
export function instrumentJavaScript(source: string): string {
  let ast: t.File;
  try {
    ast = parse(source, { sourceType: 'script', plugins: ['jsx'], allowReturnOutsideFunction: false });
  } catch (error) {
    throw new UnsupportedJavaScriptFeature(error instanceof Error ? error.message : 'Could not parse JavaScript source.');
  }

  traverse(ast, {
    ImportDeclaration() {
      throw new UnsupportedJavaScriptFeature('ES module imports are not traceable in the current JavaScript adapter.');
    },
    AwaitExpression() {
      throw new UnsupportedJavaScriptFeature('Async JavaScript is not traceable in the current JavaScript adapter.');
    },
    YieldExpression() {
      throw new UnsupportedJavaScriptFeature('Generator functions are not traceable in the current JavaScript adapter.');
    },
  });

  traverse(ast, {
    Function(path) {
      // Snapshot getters and condition thunks are generated AST with no source location.
      // They must never be treated as user functions, otherwise instrumentation recurses forever.
      if (!path.node.loc) {
        path.skip();
        return;
      }
      if (!t.isBlockStatement(path.node.body)) {
        path.node.body = t.blockStatement([t.returnStatement(path.node.body)]);
      }
      const line = path.node.loc?.start.line ?? 1;
      const name = functionName(path);
      const args = t.arrowFunctionExpression(
        [],
        t.objectExpression(
          path.node.params.flatMap((param) => t.isIdentifier(param)
            ? [t.objectProperty(t.identifier(param.name), safeRead(param.name))]
            : []),
        ),
      );
      path.node.body.body.unshift(traceCall('call', line, bindingsGetter(path), [t.stringLiteral(name), args]));
    },
    ReturnStatement(path) {
      const line = path.node.loc?.start.line ?? 1;
      const getter = bindingsGetter(path);
      const value = path.node.argument ?? t.identifier('undefined');
      path.node.argument = t.callExpression(t.memberExpression(t.identifier('__trace'), t.identifier('returnValue')), [
        t.numericLiteral(line),
        t.arrowFunctionExpression([], value),
        getter,
      ]);
    },
    IfStatement(path) {
      const line = path.node.test.loc?.start.line ?? path.node.loc?.start.line ?? 1;
      path.node.test = t.callExpression(t.memberExpression(t.identifier('__trace'), t.identifier('condition')), [
        t.numericLiteral(line),
        t.arrowFunctionExpression([], path.node.test),
        bindingsGetter(path),
      ]);
    },
    WhileStatement(path) {
      const line = path.node.test.loc?.start.line ?? path.node.loc?.start.line ?? 1;
      path.node.test = t.callExpression(t.memberExpression(t.identifier('__trace'), t.identifier('condition')), [
        t.numericLiteral(line),
        t.arrowFunctionExpression([], path.node.test),
        bindingsGetter(path),
      ]);
    },
    ForStatement(path) {
      if (!path.node.test) return;
      const line = path.node.test.loc?.start.line ?? path.node.loc?.start.line ?? 1;
      path.node.test = t.callExpression(t.memberExpression(t.identifier('__trace'), t.identifier('condition')), [
        t.numericLiteral(line),
        t.arrowFunctionExpression([], path.node.test),
        bindingsGetter(path),
      ]);
    },
    Statement: {
      exit(path) {
        const node = path.node;
        if (
          !node.loc ||
          (node as t.Statement & { __traceGenerated?: boolean }).__traceGenerated ||
          isGeneratedTraceStatement(node) ||
          t.isBlockStatement(node) ||
          t.isEmptyStatement(node) ||
          t.isReturnStatement(node) ||
          t.isThrowStatement(node) ||
          t.isBreakStatement(node) ||
          t.isContinueStatement(node) ||
          t.isDebuggerStatement(node) ||
          t.isFunctionDeclaration(node)
        ) {
          return;
        }
        const line = node.loc.start.line;
        const event = traceCall('line', line, bindingsGetter(path), [t.stringLiteral(statementEventType(node))]);
        path.insertAfter(event);
      },
    },
  });

  const start = t.expressionStatement(t.callExpression(t.memberExpression(t.identifier('__trace'), t.identifier('start')), []));
  ast.program.body.unshift(start);
  return generate(ast, { retainLines: true, compact: false }).code;
}
