export type BoundaryRole = 'process' | 'protocol' | 'worker' | 'batch' | 'cleanup' | 'unknown';

export type ExceptionHygieneFindingKind =
  | 'tool-unavailable'
  | 'useless-catch'
  | 'unsafe-finally'
  | 'return-in-finally'
  | 'catch-or-return'
  | 'prefer-catch'
  | 'prefer-await-to-then'
  | 'floating-promises'
  | 'misused-promises'
  | 'return-await-policy'
  | 'silent-catch'
  | 'catch-transform-hygiene'
  | 'redundant-nested-catch'
  | 'overscoped-try'
  | 'exception-control-flow';

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface SourceSpan {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface ExceptionHygieneFinding {
  readonly kind: ExceptionHygieneFindingKind;
  readonly message: string;
  readonly filePath: string;
  readonly span: SourceSpan;
  readonly evidence: string;
  readonly boundaryRole: BoundaryRole;
  readonly recipes: ReadonlyArray<string>;
}

export interface ExceptionHygieneAnalysis {
  readonly status: 'ok' | 'unavailable' | 'failed';
  readonly tool: 'oxc';
  readonly findings: ReadonlyArray<ExceptionHygieneFinding>;
}
