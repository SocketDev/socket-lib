/**
 * @fileoverview Vitest configuration for socket-lib
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Normalize paths for cross-platform glob patterns (forward slashes on Windows)
const toGlobPath = (pathLike: string): string => pathLike.replaceAll('\\', '/')

// Coverage mode detection
const isCoverageEnabled =
  process.env.COVERAGE === 'true' ||
  process.env.npm_lifecycle_event?.includes('coverage') ||
  process.argv.some(arg => arg.includes('coverage'))

export default defineConfig({
  cacheDir: path.resolve(projectRoot, '.cache/vitest'),
  resolve: {
    preserveSymlinks: false,
    extensions: isCoverageEnabled
      ? ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json']
      : ['.mts', '.ts', '.mjs', '.js', '.json'],
    alias: {
      '#env': path.resolve(projectRoot, 'src/env'),
      '#constants': path.resolve(projectRoot, 'src/constants'),
      '#lib': path.resolve(projectRoot, 'src/lib'),
      '#packages': path.resolve(projectRoot, 'src/lib/packages'),
      '#types': path.resolve(projectRoot, 'src/types.ts'),
      '#utils': path.resolve(projectRoot, 'src/utils'),
      cacache: path.resolve(projectRoot, 'src/external/cacache'),
      'make-fetch-happen': path.resolve(
        projectRoot,
        'src/external/make-fetch-happen',
      ),
      'fast-sort': path.resolve(projectRoot, 'src/external/fast-sort'),
      pacote: path.resolve(projectRoot, 'src/external/pacote'),
      '@socketregistry/scripts': path.resolve(projectRoot, 'scripts'),
      '@socketsecurity/lib/stdio/prompts': path.resolve(
        projectRoot,
        'src/stdio/prompts/index.ts',
      ),
      '@socketsecurity/lib': path.resolve(projectRoot, 'src'),
    },
  },
  test: {
    globalSetup: [path.resolve(__dirname, 'vitest-global-setup.mts')],
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
    // Optimize test execution for speed
    // Threads are faster than forks
    pool: 'threads',
    poolOptions: {
      threads: {
        // Maximize parallelism for speed
        // During coverage, use single thread for deterministic execution
        singleThread: isCoverageEnabled,
        maxThreads: isCoverageEnabled ? 1 : 16,
        minThreads: isCoverageEnabled ? 1 : 4,
        // IMPORTANT: isolate: false for performance and test compatibility
        //
        // Tradeoff Analysis:
        // - isolate: true  = Full isolation, slower, breaks nock/module mocking
        // - isolate: false = Shared worker context, faster, mocking works
        //
        // We choose isolate: false because:
        // 1. Significant performance improvement (faster test runs)
        // 2. HTTP mocking works correctly across all test files
        // 3. Vi.mock() module mocking functions properly
        // 4. Test state pollution is prevented through proper beforeEach/afterEach
        // 5. Our tests are designed to clean up after themselves
        // 6. The rewire module uses globalThis singleton to handle coverage module duplication
        isolate: false,
        useAtomics: true,
      },
    },
    // Reduce timeouts for faster failures
    testTimeout: 10_000,
    hookTimeout: 10_000,
    // Speed optimizations
    sequence: {
      // Run tests concurrently within suites
      concurrent: true,
    },
    // Bail early on first failure in CI
    bail: process.env.CI ? 1 : 0,
    server: {
      deps: {
        // Note: inlining @socketsecurity/lib in coverage mode would cause duplicate module instances
        // The rewire module uses globalThis singleton to handle this, so inlining is not needed
        inline: isCoverageEnabled ? [/@socketsecurity\/lib/, 'zod'] : ['zod'],
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
        // Exclude all dist directory and its contents
        'dist/**',
        '**/dist/**',
        '**/{dist,build,out}/**',
        // Exclude external bundled dependencies from both src and dist
        'src/external/**',
        'dist/external/**',
        '**/external/**',
        'src/types.ts',
        'scripts/**',
      ],
      include: [
        'src/**/*.{ts,mts,cts}',
        // Explicitly exclude external from include
        '!src/external/**',
      ],
      excludeAfterRemap: true,
      all: true,
      clean: true,
      skipFull: false,
      ignoreClassMethods: ['constructor'],
      thresholds: {
        lines: 68,
        functions: 70,
        branches: 70,
        statements: 68,
      },
    },
  },
})
