import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';

import { analyzeFormat } from '../../../../src/features/format';
import { createTempProject, installFakeBin, writeText } from '../../shared/external-tool-test-kit';

describe('integration/format/check-mode', () => {
  it("should treat non-zero exit code as needs-formatting (stdout ignored)", async () => {
    const project = await createTempProject('firebat-format-check');

    try {
      await installFakeBin(
        project.rootAbs,
        'oxfmt',
        `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1-}" == "--version" ]]; then
  echo "oxfmt 0.26.0"
  exit 0
fi

# In check mode, exit non-zero but print nothing.
exit 7
`,
      );

      const targetAbs = path.join(project.rootAbs, 'src', 'a.ts');
      await writeText(targetAbs, 'export const a = 1;');

      const analysis = await analyzeFormat({
        targets: [targetAbs],
        fix: false,
        cwd: project.rootAbs,
      });

      expect(analysis.status).toBe('needs-formatting');
      expect(typeof analysis.exitCode).toBe('number');
    } finally {
      await project.dispose();
    }
  });

  it("should treat exit code 0 as ok (even if stdout has lines)", async () => {
    const project = await createTempProject('firebat-format-check-ok');

    try {
      await installFakeBin(
        project.rootAbs,
        'oxfmt',
        `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1-}" == "--version" ]]; then
  echo "oxfmt 0.26.0"
  exit 0
fi

echo "random output that should not flip status"
exit 0
`,
      );

      const targetAbs = path.join(project.rootAbs, 'src', 'a.ts');
      await writeText(targetAbs, 'export const a = 1;');

      const analysis = await analyzeFormat({
        targets: [targetAbs],
        fix: false,
        cwd: project.rootAbs,
      });

      expect(analysis.status).toBe('ok');
    } finally {
      await project.dispose();
    }
  });
});
