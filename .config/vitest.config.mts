/**
 * @fileoverview Vitest configuration for socket-lib
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const rootPkgJson = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
)

// Normalize paths for cross-platform glob patterns (forward slashes on Windows)
const toGlobPath = (pathLike: string): string => pathLike.replaceAll('\\', '/')

const vitestConfig = defineConfig({
  cacheDir: path.resolve(projectRoot, 'node_modules/.cache/vitest'),
  resolve: {
    // Use 'source' export condition so @socketsecurity/lib/* imports resolve
    // to src/*.ts instead of dist/*.js. This enables proper v8 coverage
    // attribution to source files.
    conditions: ['source'],
    // Dedupe ensures a single module instance when the same source file is
    // reached via two import shapes — `@socketsecurity/lib/<sub>` from tests
    // and `./<sub>` from co-located leaves — so `instanceof` checks against
    // exported error classes (e.g. `HttpResponseError`) compare the same
    // prototype on both sides.
    dedupe: ['@socketsecurity/lib'],
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
      '@socketsecurity/lib': path.resolve(projectRoot, 'src'),
    },
  },
  test: {
    deps: { interopDefault: false },
    env: {
      INLINED_LIB_VERSION: rootPkgJson.version,
    },
    globalSetup: [path.resolve(__dirname, 'vitest-global-setup.mts')],
    setupFiles: [path.resolve(__dirname, 'vitest-setup-tests.mts')],
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
      toGlobPath(path.resolve(projectRoot, 'test/isolated/**')),
      ...(process.env.INCLUDE_NPM_TESTS
        ? []
        : [toGlobPath(path.resolve(projectRoot, 'test/npm/**'))]),
    ],
    reporters: ['default'],
    pool: 'threads',
    poolOptions: {
      threads: {
        // Worker heap ceiling. Each worker thread is its own V8 isolate
        // with its own heap; --max-old-space-size caps the thread's heap
        // independently of the parent process. 4 GB absorbs the
        // cumulative heap pressure across ~7000 tests sharing a worker
        // (isolate: false, below). Tests that genuinely can't fit even
        // at this ceiling live under test/isolated/ and run through
        // vitest.config.isolated.mts (singleThread + isolate: true).
        execArgv: ['--max-old-space-size=4096'],
        // Use `'CI' in process.env` instead of `process.env.CI` so an
        // empty-string CI value (some self-hosted setups) still counts
        // as "CI mode" — the latter coerces "" to false and would
        // mis-tune the pool. The truthy-value form would also miss
        // `CI=0` / `CI=false` setups.
        maxThreads: 'CI' in process.env ? 4 : 16,
        minThreads: 'CI' in process.env ? 2 : 4,
        isolate: false,
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
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'json', 'html', 'lcov', 'clover'],
      exclude: [
        '**/*.config.*',
        '**/node_modules/**',
        '**/[.]**',
        '**/*.d.ts',
        '**/virtual:*',
        'coverage/**',
        'test/**',
        'packages/**',
        'perf/**',
        'dist/**',
        '**/dist/**',
        '**/{dist,build,out}/**',
        'src/external/**',
        'dist/external/**',
        '**/external/**',
        'src/types.ts',
        'scripts/**',
        // Arborist wrapper — every code path delegates to the npm
        // Arborist library (network calls, registry lookups, lockfile
        // writes). Meaningful coverage requires integration tests
        // against a live registry, not unit tests.
        'src/dlx/arborist.ts',
        // generatePackagePin orchestration — requires real Arborist
        // resolution + httpDownload of the top-level tarball. Same
        // integration-test boundary as arborist.ts.
        'src/dlx/lockfile.ts',
        // dlxPackage / downloadPackage / ensurePackageInstalled —
        // Arborist install + Firewall API orchestration. The pure
        // helpers (parsePackageSpec, npmPurl, findBinaryPath,
        // executePackage, makePackageBinsExecutable) ARE already
        // unit-tested. The remaining orchestration is integration-
        // test territory.
        'src/dlx/package.ts',
        // dlxBinary / downloadBinary orchestration — full http
        // download + extract + cache flow. Pure parts
        // (downloadBinaryFile, executeBinary,
        // getBinaryCacheMetadataPath, getDlxCachePath) are unit-
        // tested. The orchestration needs integration tests.
        'src/dlx/binary.ts',
      ],
      include: ['src/**/*.{ts,mts,cts}', '!src/external/**'],
      excludeAfterRemap: true,
      all: true,
      clean: true,
      skipFull: false,
      ignoreClassMethods: ['constructor'],
      thresholds: {
        lines: 98,
        functions: 98,
        branches: 95,
        statements: 98,
      },
    },
  },
})

export { vitestConfig }
export default vitestConfig
