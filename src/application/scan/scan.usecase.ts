// MUST: MUST-1
import type { FirebatCliOptions } from '../../interfaces';
import type { FirebatReport } from '../../types';

import { analyzeApiDrift, createEmptyApiDrift } from '../../features/api-drift';
import { analyzeCoupling, createEmptyCoupling } from '../../features/coupling';
import { analyzeDependencies, createEmptyDependencies } from '../../features/dependencies';
import { analyzeStructuralDuplicates, createEmptyStructuralDuplicates } from '../../features/structural-duplicates';
import { analyzeEarlyReturn, createEmptyEarlyReturn } from '../../features/early-return';
import { analyzeForwarding, createEmptyForwarding } from '../../features/forwarding';
import { analyzeLint, createEmptyLint } from '../../features/lint';
import { analyzeNesting, createEmptyNesting } from '../../features/nesting';
import { analyzeNoop, createEmptyNoop } from '../../features/noop';
import { analyzeTypecheck, createEmptyTypecheck } from '../../features/typecheck';
import { detectExactDuplicates } from '../../features/exact-duplicates';
import { detectWaste } from '../../features/waste';
import { computeAutoMinSize } from '../../engine/auto-min-size';
import { initHasher } from '../../engine/hasher';
import { createFirebatProgram } from '../../ts-program';
import { getOrmDb } from '../../infrastructure/sqlite/firebat.db';
import { resolveRuntimeContextFromCwd } from '../../runtime-context';
import { computeToolVersion } from '../../tool-version';
import { createSqliteArtifactRepository } from '../../infrastructure/sqlite/artifact.repository';
import { createSqliteFileIndexRepository } from '../../infrastructure/sqlite/file-index.repository';
import { createInMemoryArtifactRepository } from '../../infrastructure/memory/artifact.repository';
import { createInMemoryFileIndexRepository } from '../../infrastructure/memory/file-index.repository';
import { createHybridArtifactRepository } from '../../infrastructure/hybrid/artifact.repository';
import { createHybridFileIndexRepository } from '../../infrastructure/hybrid/file-index.repository';
import { indexTargets } from '../indexing/file-indexer';
import { computeInputsDigest } from './inputs-digest';
import { computeProjectKey, computeScanArtifactKey } from './cache-keys';
import { computeCacheNamespace } from './cache-namespace';
import { computeProjectInputsDigest } from './project-inputs-digest';

const scanUseCase = async (options: FirebatCliOptions): Promise<FirebatReport> => {
  await initHasher();

  const ctx = await resolveRuntimeContextFromCwd();
  const toolVersion = computeToolVersion();
  const projectKey = computeProjectKey({ toolVersion, cwd: ctx.rootAbs });
  const orm = await getOrmDb({ rootAbs: ctx.rootAbs });
  const artifactRepository = createHybridArtifactRepository({
    memory: createInMemoryArtifactRepository(),
    sqlite: createSqliteArtifactRepository(orm),
  });
  const fileIndexRepository = createHybridFileIndexRepository({
    memory: createInMemoryFileIndexRepository(),
    sqlite: createSqliteFileIndexRepository(orm),
  });

  await indexTargets({
    projectKey,
    targets: options.targets,
    repository: fileIndexRepository,
    concurrency: 8,
  });

  const cacheNamespace = await computeCacheNamespace({ toolVersion });
  const projectInputsDigest = await computeProjectInputsDigest({
    projectKey,
    rootAbs: ctx.rootAbs,
    fileIndexRepository,
  });

  const inputsDigest = await computeInputsDigest({
    projectKey,
    targets: options.targets,
    fileIndexRepository,
    extraParts: [`ns:${cacheNamespace}`, `project:${projectInputsDigest}`],
  });
  const artifactKey = computeScanArtifactKey({
    detectors: options.detectors,
    minSize: options.minSize === 'auto' ? 'auto' : String(options.minSize),
    maxForwardDepth: options.maxForwardDepth,
  });
  const cached = await artifactRepository.getArtifact<FirebatReport>({
    projectKey,
    kind: 'firebat:report',
    artifactKey,
    inputsDigest,
  });

  if (cached) {
    return cached;
  }

  const program = await createFirebatProgram({
    targets: options.targets,
  });
  const resolvedMinSize =
    options.minSize === 'auto' ? computeAutoMinSize(program) : Math.max(0, Math.round(options.minSize));
  const exactDuplicates = options.detectors.includes('exact-duplicates') ? detectExactDuplicates(program, resolvedMinSize) : [];
  const waste = options.detectors.includes('waste') ? detectWaste(program) : [];
  const lint = options.detectors.includes('lint') ? await analyzeLint(options.targets) : createEmptyLint();
  const typecheck = options.detectors.includes('typecheck') ? await analyzeTypecheck(program) : createEmptyTypecheck();
  const shouldRunDependencies = options.detectors.includes('dependencies') || options.detectors.includes('coupling');
  const dependencies = shouldRunDependencies ? analyzeDependencies(program) : createEmptyDependencies();
  const coupling = options.detectors.includes('coupling') ? analyzeCoupling(dependencies) : createEmptyCoupling();
  const structuralDuplicates = options.detectors.includes('structural-duplicates')
    ? analyzeStructuralDuplicates(program, resolvedMinSize)
    : createEmptyStructuralDuplicates();
  const nesting = options.detectors.includes('nesting') ? analyzeNesting(program) : createEmptyNesting();
  const earlyReturn = options.detectors.includes('early-return') ? analyzeEarlyReturn(program) : createEmptyEarlyReturn();
  const noop = options.detectors.includes('noop') ? analyzeNoop(program) : createEmptyNoop();
  const apiDrift = options.detectors.includes('api-drift') ? analyzeApiDrift(program) : createEmptyApiDrift();
  const forwarding = options.detectors.includes('forwarding')
    ? analyzeForwarding(program, options.maxForwardDepth)
    : createEmptyForwarding();
  const report: FirebatReport = {
    meta: {
      engine: 'oxc',
      version: toolVersion,
      targetCount: program.length,
      minSize: resolvedMinSize,
      maxForwardDepth: options.maxForwardDepth,
      detectors: options.detectors,
    },
    analyses: {
      'exact-duplicates': exactDuplicates,
      waste,
      lint,
      typecheck,
      dependencies,
      coupling,
      'structural-duplicates': structuralDuplicates,
      nesting,
      earlyReturn,
      noop,
      apiDrift,
      forwarding,
    },
  };

  await artifactRepository.setArtifact({
    projectKey,
    kind: 'firebat:report',
    artifactKey,
    inputsDigest,
    value: report,
  });

  return report;
};


export { scanUseCase };
