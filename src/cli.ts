#!/usr/bin/env bun
import { cac } from 'cac';
import { Checker } from './checker';
import path from 'path';
import { EMPTY_STRING } from './constants';

const cli = cac('bun-checker');

cli
  .command('[dir]', 'Check style guide in the specified directory')
  .action((dir) => {
    const targetDir = dir || '.';
    console.log(`Checking directory: ${path.resolve(targetDir)}`);

    const checker = new Checker();
    // Add all .ts files in the directory recursively
    const pattern = path.join(targetDir, '**/*.ts');
    checker.addFiles(pattern);

    const violations = checker.run();

    if (violations.length === 0) {
      console.log('✅ No style violations found.');
      process.exit(0);
    } else {
      console.error(`❌ Found ${violations.length} style violations:`);
      for (const v of violations) {
        const loc = v.line ? `:${v.line}${v.column ? ':' + v.column : EMPTY_STRING}` : EMPTY_STRING;
        console.error(`  [${v.ruleId}] ${v.file}${loc} - ${v.message}`);
      }
      process.exit(1);
    }
  });

cli.help();
cli.version('0.1.0');

cli.parse();
