/**
 * @fileoverview Vitest configuration for socket-lib
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { defineConfig } from 'vitest/config'

import type { Plugin } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Normalize paths for cross-platform glob patterns (forward slashes on Windows)
const toGlobPath = (pathLike: string): string => pathLike.replaceAll('\\', '/')

// Coverage mode detection
const isCoverageEnabled =
  process.env.COVERAGE === 'true' ||
  process.env.npm_lifecycle_event?.includes('coverage') ||
  process.argv.some(arg => arg.includes('coverage'))

// Vite plugin that resolves @socketsecurity/lib/* imports to src/*.ts source
// files and applies module aliases. Vitest's internal config hooks override
// resolve.alias and resolve.conditions, so we use a plugin to ensure our
// resolution takes effect.
function sourceResolverPlugin(): Plugin {
  const LIB_PREFIX = '@socketsecurity/lib/'
  const LIB_EXACT = '@socketsecurity/lib'
  const aliasMap: Record<string, string> = {
    cacache: path.resolve(projectRoot, 'src/external/cacache'),
    'make-fetch-happen': path.resolve(
      projectRoot,
      'src/external/make-fetch-happen',
    ),
    'fast-sort': path.resolve(projectRoot, 'src/external/fast-sort'),
    pacote: path.resolve(projectRoot, 'src/external/pacote'),
    '@socketregistry/scripts': path.resolve(projectRoot, 'scripts'),
  }

  return {
    name: 'vitest:source-resolver',
    enforce: 'pre',
    resolveId(source) {
      // Resolve @socketsecurity/lib/* to src/*.ts
      if (source.startsWith(LIB_PREFIX)) {
        const subpath = source.slice(LIB_PREFIX.length)
        // Try direct .ts file first, then index.ts in subdirectory
        const directPath = path.resolve(projectRoot, 'src', `${subpath}.ts`)
        if (fs.existsSync(directPath)) return directPath
        const indexPath = path.resolve(projectRoot, 'src', subpath, 'index.ts')
        if (fs.existsSync(indexPath)) return indexPath
        return undefined
      }
      if (source === LIB_EXACT) {
        return path.resolve(projectRoot, 'src/index.ts')
      }
      // Resolve aliased external dependencies
      for (const [alias, target] of Object.entries(aliasMap)) {
        if (source === alias || source.startsWith(`${alias}/`)) {
          const rest = source === alias ? '' : source.slice(alias.length)
          return `${target}${rest}`
        }
      }
      return undefined
    },
    // Inject 'source' export condition into ssr resolve for worker processes
    config() {
      if (!isCoverageEnabled) return undefined
      return {
        ssr: {
          resolve: {
            conditions: ['source'],
            externalConditions: ['source'],
          },
        },
      }
    },
  }
}

const vitestConfig = defineConfig({
  cacheDir: path.resolve(projectRoot, '.cache/vitest'),
  plugins: [sourceResolverPlugin()],
  resolve: {
    preserveSymlinks: false,
    extensions: isCoverageEnabled
      ? ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json']
      : ['.mts', '.ts', '.mjs', '.js', '.json'],
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
    // Use forks in CI for stability, threads locally for speed
    pool: process.env.CI ? 'forks' : 'threads',
    poolOptions: {
      threads: {
        maxThreads: 16,
        minThreads: 4,
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
      forks: {
        // CI: Use forks for stability (no worker timeout issues)
        // Limit forks in CI to prevent file system contention on Windows
        maxForks: process.env.CI ? 4 : 16,
        minForks: process.env.CI ? 2 : 4,
        isolate: true,
      },
    },
    // Increase timeouts to prevent worker timeout on slow CI environments
    teardownTimeout: 30_000,
    // Reduce timeouts for faster failures
    testTimeout: 10_000,
    hookTimeout: 10_000,
    // Speed optimizations
    sequence: {
      // Run tests concurrently within suites locally, but sequentially in CI
      // to prevent worker timeouts from parallel binary path resolutions
      concurrent: !process.env.CI,
    },
    // Bail early on first failure in CI
    bail: process.env.CI ? 1 : 0,
    server: {
      deps: {
        // Always inline @socketsecurity/lib so that CJS require() calls within
        // dist/ bundles go through vitest's module system, enabling vi.mock()
        // to intercept cross-module dependencies. Without inlining, Node.js
        // native CJS loader handles require() calls, bypassing vi.mock().
        // The rewire modules use globalThis singletons to share state across
        // any duplicate module instances that inlining may create.
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
