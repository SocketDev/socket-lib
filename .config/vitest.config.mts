/**
 * @fileoverview Vitest configuration for socket-lib
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const rootPkgJson = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
)

// Normalize paths for cross-platform glob patterns (forward slashes on Windows)
const toGlobPath = (pathLike: string): string => pathLike.replaceAll('\\', '/')

const vitestConfig = defineConfig({
  cacheDir: path.resolve(projectRoot, '.cache/vitest'),
  resolve: {
    // Use 'source' export condition so @socketsecurity/lib/* imports resolve
    // to src/*.ts instead of dist/*.js. This enables proper v8 coverage
    // attribution to source files.
    conditions: ['source'],
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
      '@socketsecurity/lib/stdio/prompts': path.resolve(
        projectRoot,
        'src/stdio/prompts/index.ts',
      ),
      '@socketsecurity/lib': path.resolve(projectRoot, 'src'),
    },
  },
  test: {
    deps: { interopDefault: false },
    env: {
      INLINED_LIB_VERSION: rootPkgJson.version,
    },
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
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: process.env.CI ? 4 : 16,
        minThreads: process.env.CI ? 2 : 4,
        isolate: false,
        useAtomics: true,
      },
    },
    teardownTimeout: 30_000,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    sequence: {
      concurrent: !process.env.CI,
    },
    bail: process.env.CI ? 1 : 0,
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
      ],
      include: ['src/**/*.{ts,mts,cts}', '!src/external/**'],
      excludeAfterRemap: true,
      all: true,
      clean: true,
      skipFull: false,
      ignoreClassMethods: ['constructor'],
      thresholds: {
        lines: 80,
        functions: 88,
        branches: 68,
        statements: 80,
      },
    },
  },
})

export { vitestConfig }
export default vitestConfig
