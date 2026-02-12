import type { ParsedFile } from '../../engine/types';
import type { DuplicateGroup, StructuralDuplicatesAnalysis } from '../../types';

import { detectClones } from '../../engine/duplicate-detector';

const createEmptyStructuralDuplicates = (): StructuralDuplicatesAnalysis => ({
  cloneClasses: [],
});

const analyzeStructuralDuplicates = (files: ReadonlyArray<ParsedFile>, minSize: number): StructuralDuplicatesAnalysis => {
  if (files.length === 0) {
    return createEmptyStructuralDuplicates();
  }

  return {
    cloneClasses: detectClones(files, minSize, 'type-2-shape'),
  };
};

export { analyzeStructuralDuplicates, createEmptyStructuralDuplicates };
