import type { ParsedFile } from '../../engine/types';
import type { DuplicateGroup } from '../../types';

import { detectDuplicates } from '../../engine/duplicate-detector';

export const detectExactDuplicates = (files: ParsedFile[], minSize: number): DuplicateGroup[] => {
  if (files.length === 0) {
    return [];
  }

  return detectDuplicates(files, minSize);
};
