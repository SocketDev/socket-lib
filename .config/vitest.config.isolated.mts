/**
 * @file Vitest configuration for isolated tests Tests that require full
 *   isolation due to shared module state.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { defineConfig } from 'vitest/config'

import { baseCoverageConfig } from './vitest.coverage.config.mts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Worker heap cap: smaller in CI (GitHub Actions ubuntu-latest has
// ~7 GB total RAM — leave room for the runner + OS), generous locally
// where developer machines typically have plenty of RAM.
const isCI = !!process.env['CI']
const workerHeapMB = isCI ? 6144 : 12288

// Normalize paths for cross-platform glob patterns (forward slashes on Windows)
const toGlobPath = (pathLike: string): string => pathLike.replaceAll('\\', '/')

const vitestConfigIsolated = defineConfig({
  cacheDir: path.resolve(projectRoot, 'node_modules/.cache/vitest-isolated'),
  resolve: {
    preserveSymlinks: false,
    extensions: ['.mts', '.ts', '.mjs', '.js', '.json'],
    alias: {
      cacache: path.resolve(projectRoot, 'src/external/cacache'),
      'make-fetch-happen': path.resolve(
        projectRoot,
        'src/external/make-fetch-happen',
      ),
      'fast-sort': path.resolve(projectRoot, 'src/external/fast-sort'),
      pacote: path.resolve(projectRoot, 'src/external/pacote'),
      '@socketregistry/scripts': path.resolve(projectRoot, 'scripts'),
      // Resolve `@socketsecurity/lib-stable` to local src/ so test files don't
      // pull in the published version through the pnpm overrides block.
      '@socketsecurity/lib-stable': path.resolve(projectRoot, 'src'),
    },
  },
  test: {
    deps: { interopDefault: false },
    globalSetup: [path.resolve(__dirname, 'vitest-global-setup.mts')],
    globals: false,
    environment: 'node',
    include: [
      toGlobPath(
        path.resolve(projectRoot, 'test/isolated/**/*.test.{js,ts,mjs,mts}'),
      ),
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    reporters: ['default'],
    // Pin the worker's v8 old-generation heap ceiling so CI runs are
    // deterministic regardless of host RAM (Node defaults its heap
    // cap based on detected physical memory — varies by machine).
    // NOTE: this must be `test.execArgv`, not `poolOptions.X.execArgv`,
    // because vitest 4 silently ignores the latter. Pool is `forks`
    // because Node worker_threads reject --max-old-space-size in
    // execArgv (ERR_WORKER_INVALID_EXEC_ARGV).
    execArgv: [`--max-old-space-size=${workerHeapMB}`],
    // Full isolation for tests that modify shared module state.
    // Forks pool gives each test file its own child process.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        maxForks: 1,
        minForks: 1,
        isolate: true,
      },
    },
    // Heavy I/O tests (archive extraction, large http fixtures) need
    // headroom under coverage instrumentation. CI is colder and slower than
    // local dev — give it more rope. Locally we keep it tight so a hung
    // test surfaces fast.
    testTimeout: isCI ? 60_000 : 20_000,
    hookTimeout: isCI ? 60_000 : 20_000,
    sequence: {
      concurrent: false,
    },
    coverage: {
      ...baseCoverageConfig,
      reportsDirectory: 'coverage-isolated',
    },
  },
})

export { vitestConfigIsolated }
export default vitestConfigIsolated
