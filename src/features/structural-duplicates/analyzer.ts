import type { Node } from 'oxc-parser';

import type { ParsedFile } from '../../engine/types';
import type { DuplicateGroup, DuplicateItem, StructuralDuplicatesAnalysis } from '../../types';

import { collectDuplicateGroups } from '../../engine/duplicate-collector';
import { getNodeType } from '../../engine/oxc-ast-utils';
import { createOxcFingerprintShape } from '../../engine/oxc-fingerprint';

const createEmptyStructuralDuplicates = (): StructuralDuplicatesAnalysis => ({
  cloneClasses: [],
});

const isStructuralDuplicatesTarget = (node: Node): boolean => {
  const nodeType = getNodeType(node);

  return (
    nodeType === 'FunctionDeclaration' ||
    nodeType === 'ClassDeclaration' ||
    nodeType === 'MethodDefinition' ||
    nodeType === 'FunctionExpression' ||
    nodeType === 'ArrowFunctionExpression' ||
    nodeType === 'BlockStatement'
  );
};

const getItemKind = (node: Node): DuplicateItem['kind'] => {
  const nodeType = getNodeType(node);

  if (nodeType === 'FunctionDeclaration' || nodeType === 'FunctionExpression' || nodeType === 'ArrowFunctionExpression') {
    return 'function';
  }

  if (nodeType === 'MethodDefinition') {
    return 'method';
  }

  if (nodeType === 'ClassDeclaration' || nodeType === 'ClassExpression') {
    return 'type';
  }

  return 'node';
};

const detectStructuralDuplicates = (files: ReadonlyArray<ParsedFile>, minSize: number): DuplicateGroup[] => {
  return collectDuplicateGroups(files, minSize, isStructuralDuplicatesTarget, createOxcFingerprintShape, getItemKind);
};

const analyzeStructuralDuplicates = (files: ReadonlyArray<ParsedFile>, minSize: number): StructuralDuplicatesAnalysis => {
  if (files.length === 0) {
    return createEmptyStructuralDuplicates();
  }

  return {
    cloneClasses: detectStructuralDuplicates(files, minSize),
  };
};

export { analyzeStructuralDuplicates, createEmptyStructuralDuplicates };
