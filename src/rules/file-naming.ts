import type { Rule } from '../interfaces';
import type { StyleViolation } from '../types';
import type { SourceFile } from 'ts-morph';
import { isKebabCase } from '../utils/text';
import { RULE_ID_FILE_NAMING } from '../constants';

const RESERVED_FILENAMES = new Set([
  'index',
  'constants',
  'enums',
  'interfaces',
  'types',
]);

export const fileNamingRule: Rule = {
  id: RULE_ID_FILE_NAMING,
  check(file: SourceFile): StyleViolation[] {
    const baseName = file.getBaseName();
    const nameWithoutExt = file.getBaseNameWithoutExtension();

    // Check if it's a reserved file
    if (RESERVED_FILENAMES.has(nameWithoutExt)) {
      return [];
    }

    // Handle .spec.ts and .error.ts
    let nameToCheck = nameWithoutExt;
    if (nameToCheck.endsWith('.spec')) {
      nameToCheck = nameToCheck.substring(0, nameToCheck.length - 5);
    } else if (nameToCheck.endsWith('.error')) {
      nameToCheck = nameToCheck.substring(0, nameToCheck.length - 6);
    }

    if (!isKebabCase(nameToCheck)) {
      return [{
        ruleId: RULE_ID_FILE_NAMING,
        message: `Filename '${baseName}' is not kebab-case.`,
        file: file.getFilePath(),
      }];
    }

    return [];
  },
};
