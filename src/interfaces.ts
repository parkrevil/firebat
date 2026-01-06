import type { StyleViolation } from './types';
import type { SourceFile } from 'ts-morph';

export interface Rule {
  id: string;
  check(file: SourceFile): StyleViolation[];
}

export interface ProjectRule {
    id: string;
    check(files: SourceFile[]): StyleViolation[];
}
