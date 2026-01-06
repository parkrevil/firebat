import { Project } from 'ts-morph';
import type { Rule } from './interfaces';
import type { StyleViolation } from './types';
import { fileNamingRule } from './rules/file-naming';
import { typeInterfaceSeparationRule } from './rules/type-interface-separation';
import { noInlineObjectRule } from './rules/no-inline-object';
import { maxParamsRule } from './rules/max-params';
import { enumPascalCaseRule } from './rules/enum-pascal-case';
import { repeatedLiteralsRule } from './rules/repeated-literals';

export class Checker {
  private project: Project;
  private rules: Rule[];

  constructor() {
    this.project = new Project({
        skipAddingFilesFromTsConfig: true,
    });
    this.rules = [
        fileNamingRule,
        typeInterfaceSeparationRule,
        noInlineObjectRule,
        maxParamsRule,
        enumPascalCaseRule,
        repeatedLiteralsRule
    ];
  }

  public addFiles(pattern: string) {
    this.project.addSourceFilesAtPaths(pattern);
  }

  public run(): StyleViolation[] {
    const violations: StyleViolation[] = [];
    const sourceFiles = this.project.getSourceFiles();

    for (const file of sourceFiles) {
        // Skip node_modules
        if (file.getFilePath().includes('node_modules')) continue;

        for (const rule of this.rules) {
            try {
                violations.push(...rule.check(file));
            } catch (error) {
                console.error(`Error running rule ${rule.id} on ${file.getFilePath()}:`, error);
            }
        }
    }

    return violations;
  }
}
