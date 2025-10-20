/**
 * @fileoverview Vitest configuration for socket-lib
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Coverage mode detection
const isCoverageEnabled =
  process.env.COVERAGE === 'true' ||
  process.env.npm_lifecycle_event?.includes('coverage') ||
  process.argv.some(arg => arg.includes('coverage'))

export default defineConfig({
  resolve: {
    preserveSymlinks: false,
    extensions: isCoverageEnabled
      ? ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json']
      : ['.mts', '.ts', '.mjs', '.js', '.json'],
    alias: {
      '#env/ci': path.resolve(projectRoot, 'src/env/ci.ts'),
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
      '@socketsecurity/lib': path.resolve(projectRoot, 'src'),
    },
  },
  test: {
    globalSetup: [path.resolve(__dirname, 'vitest-global-setup.mts')],
    globals: false,
    environment: 'node',
    include: [
      path.resolve(projectRoot, 'test/**/*.test.{js,ts,mjs,mts,cjs,cts}'),
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      ...(process.env.INCLUDE_NPM_TESTS
        ? []
        : [path.resolve(projectRoot, 'test/npm/**')]),
    ],
    reporters: ['default'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: isCoverageEnabled,
        maxThreads: isCoverageEnabled ? 1 : 16,
        minThreads: isCoverageEnabled ? 1 : 4,
        // Use isolate: false for performance and test compatibility
        isolate: false,
        useAtomics: true,
      },
    },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    server: {
      deps: {
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
        'dist/**',
        'src/external/**',
        'src/types.ts',
        'scripts/**',
      ],
      include: ['src/**/*.{ts,mts,cts}'],
      all: true,
      clean: true,
      skipFull: false,
      ignoreClassMethods: ['constructor'],
      thresholds: {
        lines: 1,
        functions: 68,
        branches: 70,
        statements: 1,
      },
    },
  },
})
