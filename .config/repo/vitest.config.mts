/**
 * @file Vitest configuration for socket-lib
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { baseCoverageConfig } from '../vitest.coverage.config.mts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const rootPkgJson = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
)

// Normalize paths for cross-platform glob patterns (forward slashes on Windows)
const toGlobPath = (pathLike: string): string => pathLike.replaceAll('\\', '/')

const vitestConfig = defineConfig({
  cacheDir: path.resolve(projectRoot, 'node_modules/.cache/vitest'),
  resolve: {
    // Use 'source' export condition so @socketsecurity/lib-stable/* imports resolve
    // to src/*.ts instead of dist/*.js. This enables proper v8 coverage
    // attribution to source files.
    conditions: ['source'],
    // Dedupe ensures a single module instance when the same source file is
    // reached via two import shapes — `@socketsecurity/lib-stable/<sub>` from tests
    // and `./<sub>` from co-located leaves — so `instanceof` checks against
    // exported error classes (e.g. `HttpResponseError`) compare the same
    // prototype on both sides.
    dedupe: ['@socketsecurity/lib', '@socketsecurity/lib-stable'],
    preserveSymlinks: false,
    alias: {
      cacache: path.resolve(projectRoot, 'src/external/cacache'),
      'make-fetch-happen': path.resolve(
        projectRoot,
        'src/external/make-fetch-happen',
      ),
      'fast-sort': path.resolve(projectRoot, 'src/external/fast-sort'),
      pacote: path.resolve(projectRoot, 'src/external/pacote'),
      '@socketregistry/scripts': path.resolve(projectRoot, 'scripts'),
      // Resolve `@socketsecurity/lib(-stable)` to local src/ so test files
      // don't pull in the published version through the pnpm overrides block
      // and so the workspace self-import + a test's `@socketsecurity/lib/<sub>`
      // import share one module instance (matters for `Object.is` /
      // `instanceof` checks across import shapes).
      '@socketsecurity/lib': path.resolve(projectRoot, 'src'),
      '@socketsecurity/lib-stable': path.resolve(projectRoot, 'src'),
    },
  },
  test: {
    deps: { interopDefault: false },
    env: {
      INLINED_LIB_VERSION: rootPkgJson.version,
      // Near-instant retry backoff in tests. The GitHub release helpers
      // retry with 5s/10s exponential backoff via node:timers/promises,
      // which fake timers don't reliably intercept — a real-wallclock
      // sleep would make these tests take 15-19s each and starve the
      // worker pool. Zero base delay keeps them sub-second.
      SOCKET_GITHUB_RETRY_BASE_DELAY_MS: '0',
    },
    globalSetup: [path.resolve(__dirname, '..', 'vitest-global-setup.mts')],
    setupFiles: [path.resolve(__dirname, '..', 'vitest-setup-tests.mts')],
    globals: false,
    environment: 'node',
    include: [
      toGlobPath(
        path.resolve(
          projectRoot,
          'test/unit/**/*.test.{js,ts,mjs,mts,cjs,cts}',
        ),
      ),
      toGlobPath(
        path.resolve(
          projectRoot,
          'test/integration/**/*.test.{js,ts,mjs,mts,cjs,cts}',
        ),
      ),
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist/external/**',
      // The `include` whitelist above only matches test/unit/** and
      // test/integration/**, but vitest's discovery still walks
      // workspace-wide and matches some patterns despite the
      // whitelist. The excludes below are absolute-path forms so they
      // match regardless of glob resolution root. Dirs listed here
      // all use `node --test` not vitest; their suites produce zero
      // vitest describe/it blocks AND emit node-test runner output
      // (the `ℹ tests N` lines + uncaughtException-on-process.exit
      // teardown noise) that vitest reports as file-level failures.
      // Mirrors socket-wheelhouse template/.config/vitest.config.mts.
      toGlobPath(path.resolve(projectRoot, '.git-hooks/**')),
      toGlobPath(path.resolve(projectRoot, '.config/oxlint-plugin/test/**')),
      toGlobPath(path.resolve(projectRoot, 'scripts/**/test/**')),
      toGlobPath(path.resolve(projectRoot, '.claude/hooks/**/test/**')),
      toGlobPath(
        path.resolve(projectRoot, 'template/.claude/hooks/**/test/**'),
      ),
      toGlobPath(path.resolve(projectRoot, 'test/isolated/**')),
      ...(process.env.INCLUDE_NPM_TESTS
        ? []
        : [toGlobPath(path.resolve(projectRoot, 'test/npm/**'))]),
    ],
    reporters: ['default'],
    // Threads pool is faster than forks (~3× lower startup, shared
    // module graph). Workers inherit the parent's v8 heap autodetect
    // (~4 GB on a 64 GB host, ~3 GB on CI ubuntu-latest). We do not
    // pin --max-old-space-size here because Node's worker_threads
    // reject it in execArgv (ERR_WORKER_INVALID_EXEC_ARGV); tests
    // that need an explicit heap cap or per-file isolation live under
    // test/isolated/ and run through vitest.config.isolated.mts
    // (forks pool, per-file heap cap, isolate: true). Note also that
    // vitest 4 silently ignores `poolOptions.X.execArgv` — even if
    // threads accepted heap flags, that key wouldn't reach the worker.
    pool: 'threads',
    poolOptions: {
      threads: {
        // Use `'CI' in process.env` instead of `process.env.CI` so an
        // empty-string CI value (some self-hosted setups) still counts
        // as "CI mode" — the latter coerces "" to false and would
        // mis-tune the pool. The truthy-value form would also miss
        // `CI=0` / `CI=false` setups.
        maxThreads: 'CI' in process.env ? 4 : 16,
        minThreads: 'CI' in process.env ? 2 : 4,
        // isolate: false is the speed knob for the non-coverage path.
        // Under coverage (--coverage), the v8 provider needs per-file
        // module reset for accurate attribution — without isolation,
        // module-level state from earlier tests in the thread bleeds
        // into later tests' instrumentation (vi.mock targets leak
        // across files, primordial init runs only once, etc.).
        // Detection: vitest sets process.env.VITEST + the CLI passes
        // --coverage. Check both — argv from the parent CLI, the env
        // var visible to workers.
        isolate:
          process.argv.includes('--coverage') ||
          process.env['npm_lifecycle_event']?.includes('cover') === true ||
          process.env['COVERAGE'] === '1',
        useAtomics: true,
      },
    },
    teardownTimeout: 30_000,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    sequence: {
      concurrent: !('CI' in process.env),
    },
    bail: 'CI' in process.env ? 1 : 0,
    server: {
      deps: {
        inline: [/@socketsecurity\/lib/, 'zod'],
      },
    },
    coverage: {
      ...baseCoverageConfig,
      reportsDirectory: 'coverage',
    },
  },
})

export { vitestConfig }
export default vitestConfig
