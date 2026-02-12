import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';

import { analyzeFormat } from '../../../../src/features/format';
import { createTempProject, writeText } from '../../shared/external-tool-test-kit';

describe('integration/format/binary-missing', () => {
  it("should return status='unavailable' when oxfmt binary can't be resolved (project-only)", async () => {
    const project = await createTempProject('firebat-format-missing-bin');

    try {
      const targetAbs = path.join(project.rootAbs, 'src', 'a.ts');
      await writeText(targetAbs, 'export const a = 1;');

      const analysis = await analyzeFormat({
        targets: [targetAbs],
        fix: false,
        cwd: project.rootAbs,
        resolveMode: 'project-only',
      });

      expect(analysis.status).toBe('unavailable');
      expect(analysis.error ?? '').toContain('not available');
    } finally {
      await project.dispose();
    }
  });
});
