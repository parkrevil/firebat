import type { Node } from 'oxc-parser';

import type { NodeValue, ParsedFile } from '../../engine/types';

import { isNodeRecord, isOxcNode, walkOxcTree } from '../../engine/oxc-ast-utils';
import { getLineColumn } from '../../engine/source-position';

import type {
  BoundaryRole,
  ExceptionHygieneAnalysis,
  ExceptionHygieneFinding,
  ExceptionHygieneFindingKind,
  SourceSpan,
} from './types';

const getSpan = (node: Node, sourceText: string): SourceSpan => {
  const start = getLineColumn(sourceText, node.start);
  const end = getLineColumn(sourceText, node.end);

  return {
    start,
    end,
  };
};

const inferBoundaryRole = (filePath: string): BoundaryRole => {
  const normalized = filePath.replaceAll('\\', '/');

  if (normalized.endsWith('/index.ts') || normalized.includes('/src/adapters/cli/')) {
    return 'process';
  }

  if (normalized.includes('/src/adapters/mcp/')) {
    return 'protocol';
  }

  if (normalized.includes('/src/infrastructure/')) {
    return 'worker';
  }

  return 'unknown';
};

const pushFinding = (findings: ExceptionHygieneFinding[], input: {
  readonly kind: ExceptionHygieneFindingKind;
  readonly filePath: string;
  readonly sourceText: string;
  readonly node: Node;
  readonly message: string;
  readonly evidence: string;
  readonly recipes: readonly string[];
}): void => {
  const evidence = input.evidence.length > 0 ? input.evidence : 'unknown';

  findings.push({
    kind: input.kind,
    message: input.message,
    filePath: input.filePath,
    span: getSpan(input.node, input.sourceText),
    evidence,
    boundaryRole: inferBoundaryRole(input.filePath),
    recipes: input.recipes,
  });
};

const getEvidenceLineAt = (sourceText: string, index: number): string => {
  const start = Math.max(0, sourceText.lastIndexOf('\n', index - 1) + 1);
  const endBreak = sourceText.indexOf('\n', index);
  const end = endBreak === -1 ? sourceText.length : endBreak;

  return sourceText.slice(start, end).trim();
};

const isIdentifierName = (node: unknown, name: string): boolean => {
  return !!node && typeof node === 'object' && isOxcNode(node as any) && (node as any).type === 'Identifier' && isNodeRecord(node as any) && (node as any).name === name;
};

const getMemberPropertyName = (callee: any): string | null => {
  if (!isOxcNode(callee) || callee.type !== 'MemberExpression' || !isNodeRecord(callee)) {
    return null;
  }

  const prop = (callee as any).property;

  if (isOxcNode(prop) && prop.type === 'Identifier' && isNodeRecord(prop) && typeof (prop as any).name === 'string') {
    return (prop as any).name as string;
  }

  return null;
};

const isPromiseFactoryCall = (expr: any): boolean => {
  if (!isOxcNode(expr) || expr.type !== 'CallExpression' || !isNodeRecord(expr)) {
    // `new Promise(...)`
    if (isOxcNode(expr) && expr.type === 'NewExpression' && isNodeRecord(expr)) {
      const callee = (expr as any).callee;

      return isOxcNode(callee) && callee.type === 'Identifier' && isNodeRecord(callee) && (callee as any).name === 'Promise';
    }

    return false;
  }

  const callee = (expr as any).callee;

  if (!isOxcNode(callee) || callee.type !== 'MemberExpression' || !isNodeRecord(callee)) {
    return false;
  }

  const obj = (callee as any).object;
  const prop = (callee as any).property;

  if (!isOxcNode(obj) || !isOxcNode(prop)) {
    return false;
  }

  if (obj.type !== 'Identifier' || !isNodeRecord(obj) || (obj as any).name !== 'Promise') {
    return false;
  }

  if (prop.type !== 'Identifier' || !isNodeRecord(prop)) {
    return false;
  }

  const name = (prop as any).name;

  return (
    name === 'resolve' ||
    name === 'reject' ||
    name === 'all' ||
    name === 'race' ||
    name === 'any' ||
    name === 'allSettled'
  );
};

const containsReturnStatement = (node: any): boolean => {
  let found = false;

  walkOxcTree(node, inner => {
    if (inner.type === 'ReturnStatement') {
      found = true;
      return false;
    }

    return true;
  });

  return found;
};

const containsReturnOrThrowStatement = (node: any): boolean => {
  let found = false;

  walkOxcTree(node, inner => {
    if (inner.type === 'ReturnStatement' || inner.type === 'ThrowStatement') {
      found = true;
      return false;
    }

    return true;
  });

  return found;
};

const containsThrowStatement = (node: any): boolean => {
  let found = false;

  walkOxcTree(node, inner => {
    if (inner.type === 'ThrowStatement') {
      found = true;
      return false;
    }

    return true;
  });

  return found;
};

const containsIdentifierUse = (node: any, name: string): boolean => {
  let found = false;

  walkOxcTree(node, inner => {
    if (inner.type === 'Identifier' && isNodeRecord(inner) && (inner as any).name === name) {
      found = true;
      return false;
    }

    return true;
  });

  return found;
};

const hasCausePropertyWithIdentifier = (node: any, name: string): boolean => {
  let found = false;

  walkOxcTree(node, inner => {
    if (inner.type !== 'ObjectExpression' || !isNodeRecord(inner)) {
      return true;
    }

    const props = Array.isArray((inner as any).properties) ? ((inner as any).properties as any[]) : [];

    for (const prop of props) {
      if (!isOxcNode(prop) || !isNodeRecord(prop) || prop.type !== 'Property') {
        continue;
      }

      const key = (prop as any).key;
      const value = (prop as any).value;

      const isCauseKey =
        (isOxcNode(key) && key.type === 'Identifier' && isNodeRecord(key) && (key as any).name === 'cause') ||
        (isOxcNode(key) && key.type === 'Literal' && isNodeRecord(key) && (key as any).value === 'cause');

      if (!isCauseKey) {
        continue;
      }

      if (isIdentifierName(value, name)) {
        found = true;
        return false;
      }
    }

    return true;
  });

  return found;
};

const isConsoleLikeCall = (stmt: any): boolean => {
  if (!isOxcNode(stmt) || !isNodeRecord(stmt) || stmt.type !== 'ExpressionStatement') {
    return false;
  }

  const expr = (stmt as any).expression;

  if (!isOxcNode(expr) || !isNodeRecord(expr) || expr.type !== 'CallExpression') {
    return false;
  }

  const callee = (expr as any).callee;

  if (!isOxcNode(callee) || !isNodeRecord(callee) || callee.type !== 'MemberExpression') {
    return false;
  }

  const obj = (callee as any).object;

  return isOxcNode(obj) && isNodeRecord(obj) && obj.type === 'Identifier' && (obj as any).name === 'console';
};

const hasNonEmptyReturnInFinallyCallback = (arg: any): boolean => {
  if (!isOxcNode(arg)) {
    return false;
  }

  if (arg.type === 'ArrowFunctionExpression' && isNodeRecord(arg)) {
    const body = (arg as any).body;

    if (isOxcNode(body) && body.type === 'BlockStatement') {
      return containsReturnStatement(body);
    }

    // expression body => returns a value
    return true;
  }

  if ((arg.type === 'FunctionExpression' || arg.type === 'FunctionDeclaration') && isNodeRecord(arg)) {
    const body = (arg as any).body;

    if (isOxcNode(body) && body.type === 'BlockStatement') {
      return containsReturnStatement(body);
    }
  }

  return false;
};

const collectFindings = (program: NodeValue, sourceText: string, filePath: string): ExceptionHygieneFinding[] => {
  const findings: ExceptionHygieneFinding[] = [];
  const boundaryRole = inferBoundaryRole(filePath);
  const tryBlockRanges: Array<{ readonly start: number; readonly end: number }> = [];

  const tryCatchStack: Array<{ readonly hasCatch: boolean }> = [];

  const reportOverscopedTryIfNeeded = (node: any): void => {
    if (!isOxcNode(node) || !isNodeRecord(node) || node.type !== 'TryStatement') {
      return;
    }

    const handler = (node as any).handler;
    const block = (node as any).block;

    if (!isOxcNode(handler) || handler.type !== 'CatchClause') {
      return;
    }

    if (!isOxcNode(block) || block.type !== 'BlockStatement' || !isNodeRecord(block)) {
      return;
    }

    const stmts = Array.isArray((block as any).body) ? ((block as any).body as any[]) : [];

    // Objective-only heuristic (spec): many top-level statements
    if (stmts.length >= 10) {
      pushFinding(findings, {
        kind: 'overscoped-try',
        node: node as any,
        filePath,
        sourceText,
        message: 'try scope is too broad and hides error boundaries',
        evidence: getEvidenceLineAt(sourceText, node.start),
        recipes: ['RCP-16'],
      });
    }
  };

  const reportExceptionControlFlowIfNeeded = (node: any): void => {
    if (!isOxcNode(node) || !isNodeRecord(node) || node.type !== 'TryStatement') {
      return;
    }

    const handler = (node as any).handler;
    const finalizer = (node as any).finalizer;
    const block = (node as any).block;

    if (!isOxcNode(handler) || handler.type !== 'CatchClause' || finalizer !== null) {
      return;
    }

    if (!isOxcNode(block) || block.type !== 'BlockStatement' || !isNodeRecord(block)) {
      return;
    }

    const stmts = Array.isArray((block as any).body) ? ((block as any).body as any[]) : [];
    if (stmts.length !== 1) {
      return;
    }

    const catchBody = (handler as any).body;
    if (!isOxcNode(catchBody) || catchBody.type !== 'BlockStatement' || !isNodeRecord(catchBody)) {
      return;
    }

    const catchStmts = Array.isArray((catchBody as any).body) ? ((catchBody as any).body as any[]) : [];
    const hasThrow = containsThrowStatement(catchBody);
    if (hasThrow) {
      return;
    }

    const hasDefaultReturn = catchStmts.some(s => isOxcNode(s) && (s.type === 'ReturnStatement' || s.type === 'ContinueStatement' || s.type === 'BreakStatement'));
    if (!hasDefaultReturn) {
      return;
    }

    pushFinding(findings, {
      kind: 'exception-control-flow',
      node: node as any,
      filePath,
      sourceText,
      message: 'try/catch is used for control flow with default fallback',
      evidence: getEvidenceLineAt(sourceText, node.start),
      recipes: ['RCP-17', 'RCP-11'],
    });
  };

  const reportSilentCatchIfNeeded = (catchClause: any): void => {
    const param = (catchClause as any).param;
    const body = (catchClause as any).body;

    if (!isOxcNode(body) || body.type !== 'BlockStatement' || !isNodeRecord(body)) {
      return;
    }

    const stmts = Array.isArray((body as any).body) ? ((body as any).body as any[]) : [];
    const hasThrow = containsThrowStatement(body);

    if (hasThrow) {
      return;
    }

    const hasReturnOrJump = stmts.some(s => isOxcNode(s) && (s.type === 'ReturnStatement' || s.type === 'ContinueStatement' || s.type === 'BreakStatement'));
    const isEmpty = stmts.length === 0;
    const isOnlyConsole = stmts.length > 0 && stmts.every(isConsoleLikeCall);

    if (!(isEmpty || isOnlyConsole || hasReturnOrJump)) {
      return;
    }

    pushFinding(findings, {
      kind: 'silent-catch',
      node: catchClause as any,
      filePath,
      sourceText,
      message: 'catch swallows an error without propagation or explicit handling',
      evidence: getEvidenceLineAt(sourceText, catchClause.start),
      recipes: ['RCP-01', 'RCP-02', 'RCP-11'],
    });

    void param;
  };

  const reportCatchTransformHygieneIfNeeded = (catchClause: any): void => {
    const param = (catchClause as any).param;
    const body = (catchClause as any).body;

    if (!isOxcNode(param) || param.type !== 'Identifier' || !isNodeRecord(param)) {
      return;
    }

    if (!isOxcNode(body) || body.type !== 'BlockStatement' || !isNodeRecord(body)) {
      return;
    }

    const name = (param as any).name as string;

    // Find throw new X(...)
    walkOxcTree(body, node => {
      if (node.type !== 'ThrowStatement' || !isNodeRecord(node)) {
        return true;
      }

      const arg = (node as any).argument;

      if (!isOxcNode(arg) || arg.type !== 'NewExpression' || !isNodeRecord(arg)) {
        return true;
      }

      const usesIdentifier = containsIdentifierUse(arg, name);
      const hasCause = hasCausePropertyWithIdentifier(arg, name);

      // If identifier only appears as catch parameter but not in thrown expression, it's information loss
      if (!usesIdentifier && !hasCause) {
        pushFinding(findings, {
          kind: 'catch-transform-hygiene',
          node: catchClause as any,
          filePath,
          sourceText,
          message: 'catch transforms error without preserving cause/context',
          evidence: getEvidenceLineAt(sourceText, (node as any).start),
          recipes: ['RCP-02'],
        });
      }

      return true;
    });
  };

  const isNestedUnderOuterCatch = (): boolean => {
    if (tryCatchStack.length < 2) {
      return false;
    }

    // Any outer try in this function that has a catch qualifies
    return tryCatchStack.slice(0, -1).some(e => e.hasCatch);
  };

  const reportRedundantNestedCatchIfNeeded = (catchClause: any): void => {
    if (!isNestedUnderOuterCatch()) {
      return;
    }

    // If inner catch is useless-catch OR silent-catch style, report redundancy.
    const param = (catchClause as any).param;
    const body = (catchClause as any).body;

    const isUselessRethrow = (() => {
      if (!isOxcNode(param) || param.type !== 'Identifier' || !isNodeRecord(param)) {
        return false;
      }

      if (!isOxcNode(body) || body.type !== 'BlockStatement' || !isNodeRecord(body)) {
        return false;
      }

      const name = (param as any).name as string;
      const stmts = Array.isArray((body as any).body) ? ((body as any).body as any[]) : [];

      if (stmts.length !== 1) {
        return false;
      }

      const only = stmts[0];
      if (!isOxcNode(only) || only.type !== 'ThrowStatement' || !isNodeRecord(only)) {
        return false;
      }

      return isIdentifierName((only as any).argument, name);
    })();

    const isSilent = (() => {
      if (!isOxcNode(body) || body.type !== 'BlockStatement' || !isNodeRecord(body)) {
        return false;
      }

      if (containsThrowStatement(body)) {
        return false;
      }

      const stmts = Array.isArray((body as any).body) ? ((body as any).body as any[]) : [];
      const hasReturnOrJump = stmts.some(s => isOxcNode(s) && (s.type === 'ReturnStatement' || s.type === 'ContinueStatement' || s.type === 'BreakStatement'));
      const isEmpty = stmts.length === 0;
      const isOnlyConsole = stmts.length > 0 && stmts.every(isConsoleLikeCall);

      return isEmpty || isOnlyConsole || hasReturnOrJump;
    })();

    if (!(isUselessRethrow || isSilent)) {
      return;
    }

    pushFinding(findings, {
      kind: 'redundant-nested-catch',
      node: catchClause as any,
      filePath,
      sourceText,
      message: 'nested catch is redundant under an outer catch',
      evidence: getEvidenceLineAt(sourceText, catchClause.start),
      recipes: ['RCP-01', 'RCP-02'],
    });
  };

  const visit = (value: any): void => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }

      return;
    }

    if (!isOxcNode(value)) {
      return;
    }

    const node = value as any;

    // Pre-order hooks
    if (node.type === 'TryStatement' && isNodeRecord(node)) {
      // Existing bookkeeping for return-await-policy
      const block = (node as any).block;
      if (isOxcNode(block)) {
        tryBlockRanges.push({ start: block.start, end: block.end });
      }

      reportOverscopedTryIfNeeded(node);
      reportExceptionControlFlowIfNeeded(node);

      const hasCatch = isOxcNode((node as any).handler) && (node as any).handler.type === 'CatchClause';
      tryCatchStack.push({ hasCatch });

      // Visit children in structure order
      visit((node as any).block);
      visit((node as any).handler);
      visit((node as any).finalizer);

      tryCatchStack.pop();
      return;
    }

    if (node.type === 'CatchClause' && isNodeRecord(node)) {
      reportRedundantNestedCatchIfNeeded(node);
      reportSilentCatchIfNeeded(node);
      reportCatchTransformHygieneIfNeeded(node);
      // Keep visiting for other rules
    }

    // Fall back to generic traversal
    if (!isNodeRecord(node)) {
      return;
    }

    const entries = Object.entries(node);
    for (const [key, childValue] of entries) {
      if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') {
        continue;
      }

      visit(childValue);
    }
  };

  // Existing rule set (EH-01..09) still uses walkOxcTree.
  walkOxcTree(program, node => {
    // EH-02 unsafe-finally: try/finally that throws/returns in finalizer
    if (node.type === 'TryStatement' && isNodeRecord(node)) {
      const block = (node as any).block;

      if (isOxcNode(block)) {
        tryBlockRanges.push({ start: block.start, end: block.end });
      }

      const finalizer = (node as any).finalizer;

      if (isOxcNode(finalizer) && finalizer.type === 'BlockStatement' && isNodeRecord(finalizer)) {
        if (containsReturnOrThrowStatement(finalizer)) {
          pushFinding(findings, {
            kind: 'unsafe-finally',
            node: node as any,
            filePath,
            sourceText,
            message: 'finally masks original control flow with return/throw',
            evidence: 'finally contains return/throw',
            recipes: ['RCP-03'],
          });
        }
      }
    }

    // EH-01 useless-catch: catch rethrows same identifier without adding anything
    if (node.type === 'CatchClause' && isNodeRecord(node)) {
      // If redundant nested-catch is already applicable, prefer the stronger structural signal.
      if (tryCatchStack.length > 1 && tryCatchStack.slice(0, -1).some(e => e.hasCatch)) {
        // let EH-12 handle it
        return true;
      }

      const param = (node as any).param;
      const body = (node as any).body;

      if (isOxcNode(param) && param.type === 'Identifier' && isNodeRecord(param) && isOxcNode(body) && body.type === 'BlockStatement') {
        const name = (param as any).name as string;
        const stmts = Array.isArray((body as any).body) ? ((body as any).body as any[]) : [];

        if (stmts.length === 1) {
          const only = stmts[0];

          if (isOxcNode(only) && only.type === 'ThrowStatement' && isNodeRecord(only)) {
            const arg = (only as any).argument;

            if (isIdentifierName(arg, name)) {
              pushFinding(findings, {
                kind: 'useless-catch',
                node: node as any,
                filePath,
                sourceText,
                message: 'catch rethrows without adding context',
                evidence: getEvidenceLineAt(sourceText, node.start),
                recipes: ['RCP-01', 'RCP-02'],
              });
            }
          }
        }
      }
    }

    // EH-03 return-in-finally: .finally(() => { return ... })
    if (node.type === 'CallExpression' && isNodeRecord(node)) {
      const callee = (node as any).callee;
      const method = getMemberPropertyName(callee);

      if (method === 'finally') {
        const args = Array.isArray((node as any).arguments) ? ((node as any).arguments as any[]) : [];
        const first = args[0];

        if (hasNonEmptyReturnInFinallyCallback(first)) {
          pushFinding(findings, {
            kind: 'return-in-finally',
            node: node as any,
            filePath,
            sourceText,
            message: 'finally callback should not return a value',
            evidence: getEvidenceLineAt(sourceText, node.start),
            recipes: ['RCP-04'],
          });
        }
      }

      // EH-05 prefer-catch: .then(success, failure)
      if (method === 'then') {
        const args = Array.isArray((node as any).arguments) ? ((node as any).arguments as any[]) : [];
        const second = args[1];

        if (second !== undefined) {
          pushFinding(findings, {
            kind: 'prefer-catch',
            node: node as any,
            filePath,
            sourceText,
            message: 'prefer .catch over then second argument',
            evidence: getEvidenceLineAt(sourceText, node.start),
            recipes: ['RCP-07'],
          });
        }
      }

      // EH-06 prefer-await-to-then: long then chains with block callbacks
      if (method === 'then') {
        const inner = (callee as any).object;
        const hasNestedThen =
          isOxcNode(inner) &&
          inner.type === 'CallExpression' &&
          isNodeRecord(inner) &&
          getMemberPropertyName((inner as any).callee) === 'then';

        if (hasNestedThen) {
          const args = Array.isArray((node as any).arguments) ? ((node as any).arguments as any[]) : [];
          const anyBlockCb = args.some(
            arg =>
              isOxcNode(arg) &&
              arg.type === 'ArrowFunctionExpression' &&
              isNodeRecord(arg) &&
              isOxcNode((arg as any).body) &&
              (arg as any).body.type === 'BlockStatement',
          );

          if (anyBlockCb) {
            pushFinding(findings, {
              kind: 'prefer-await-to-then',
              node: node as any,
              filePath,
              sourceText,
              message: 'prefer await over long then chains for control flow',
              evidence: getEvidenceLineAt(sourceText, node.start),
              recipes: ['RCP-08'],
            });
          }
        }
      }
    }

    // Expression-statement based rules.
    if (node.type === 'ExpressionStatement' && isNodeRecord(node)) {
      const expr = (node as any).expression;

      // ignore explicit void
      if (isOxcNode(expr) && expr.type === 'UnaryExpression' && isNodeRecord(expr) && (expr as any).operator === 'void') {
        return true;
      }

      // EH-07 floating-promises: Promise.* / new Promise as expression statement
      if (isPromiseFactoryCall(expr)) {
        pushFinding(findings, {
          kind: 'floating-promises',
          node: node as any,
          filePath,
          sourceText,
          message: 'promise is created but not observed',
          evidence: getEvidenceLineAt(sourceText, node.start),
          recipes: ['RCP-09', 'RCP-10', 'RCP-11'],
        });

        return true;
      }

      // EH-04 catch-or-return: top-level then call without catch
      if (isOxcNode(expr) && expr.type === 'CallExpression' && isNodeRecord(expr)) {
        const callee = (expr as any).callee;
        const method = getMemberPropertyName(callee);

        if (method === 'then') {
          pushFinding(findings, {
            kind: 'catch-or-return',
            node: node as any,
            filePath,
            sourceText,
            message: 'promise chain should have catch or be awaited/returned',
            evidence: getEvidenceLineAt(sourceText, node.start),
            recipes: ['RCP-05', 'RCP-06'],
          });
        }

      }
    }

    // EH-08 misused-promises: async callback passed to forEach
    if (node.type === 'CallExpression' && isNodeRecord(node)) {
      const callee = (node as any).callee;
      const method = getMemberPropertyName(callee);

      if (method && (
        method === 'forEach' ||
        method === 'map' ||
        method === 'filter' ||
        method === 'some' ||
        method === 'every' ||
        method === 'find' ||
        method === 'findIndex' ||
        method === 'reduce' ||
        method === 'reduceRight' ||
        method === 'sort'
      )) {
        const args = Array.isArray((node as any).arguments) ? ((node as any).arguments as any[]) : [];
        const first = args[0];
        const isAsyncFn =
          isOxcNode(first) &&
          (first.type === 'ArrowFunctionExpression' || first.type === 'FunctionExpression') &&
          isNodeRecord(first) &&
          (first as any).async === true;

        if (isAsyncFn) {
          pushFinding(findings, {
            kind: 'misused-promises',
            node: node as any,
            filePath,
            sourceText,
            message: 'async callback is passed where a sync callback is expected',
            evidence: `${method} callback is async`,
            recipes: ['RCP-12', 'RCP-13'],
          });
        }
      }
    }

    // EH-09 return-await-policy: return await outside boundaries, or outside try/catch in boundaries
    if (node.type === 'ReturnStatement' && isNodeRecord(node)) {
      const arg = (node as any).argument;

      if (isOxcNode(arg) && arg.type === 'AwaitExpression') {
        const insideTryBlock = tryBlockRanges.some(r => typeof node.start === 'number' && node.start >= r.start && node.start <= r.end);
        const isBoundary = boundaryRole === 'process' || boundaryRole === 'protocol' || boundaryRole === 'worker';

        if (!(isBoundary && insideTryBlock)) {
          pushFinding(findings, {
            kind: 'return-await-policy',
            node: node as any,
            filePath,
            sourceText,
            message: 'avoid return await outside boundaries',
            evidence: getEvidenceLineAt(sourceText, node.start),
            recipes: ['RCP-14', 'RCP-15'],
          });
        }
      }
    }

    return true;
  });

  // Run enhanced traversal for EH-10..14 and for nested context.
  visit(program);

  return findings;
};

const createEmptyExceptionHygiene = (): ExceptionHygieneAnalysis => ({
  status: 'ok',
  tool: 'oxc',
  findings: [],
});

const analyzeExceptionHygiene = (files: ReadonlyArray<ParsedFile>): ExceptionHygieneAnalysis => {
  if (files.length === 0) {
    return createEmptyExceptionHygiene();
  }

  const findings: ExceptionHygieneFinding[] = [];

  for (const file of files) {
    if (file.errors.length > 0) {
      continue;
    }

    findings.push(...collectFindings(file.program, file.sourceText, file.filePath));
  }

  return {
    status: 'ok',
    tool: 'oxc',
    findings,
  };
};

export { analyzeExceptionHygiene, createEmptyExceptionHygiene };
