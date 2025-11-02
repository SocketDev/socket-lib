/**
 * @fileoverview esbuild configuration for external package bundling.
 */

/**
 * Get package-specific esbuild options.
 *
 * @param {string} packageName - The package name
 * @returns {object} Package-specific esbuild options
 */
export function getPackageSpecificOptions(packageName) {
  const opts = {}

  if (packageName === 'browserslist') {
    // Browserslist's data updates frequently - we can exclude some update checking.
    opts.define = {
      'process.versions.node': '"18.0.0"',
    }
  } else if (packageName === 'zod') {
    // Zod has localization files we don't need.
    opts.external = [...(opts.external || []), './locales/*']
  } else if (packageName.startsWith('@inquirer/')) {
    // Inquirer packages have heavy dependencies we might not need.
    opts.external = [...(opts.external || []), 'rxjs/operators']
  } else if (packageName === '@socketregistry/packageurl-js') {
    // packageurl-js imports from socket-lib, creating a circular dependency.
    // Mark socket-lib imports as external to avoid bundling issues.
    opts.external = [...(opts.external || []), '@socketsecurity/lib/*']
  } else if (packageName === 'yargs-parser') {
    // yargs-parser uses import.meta.url which isn't available in CommonJS.
    // Replace import.meta.url with __filename wrapped in pathToFileURL.
    opts.define = {
      ...opts.define,
      'import.meta.url': '__filename',
    }
  }

  return opts
}

/**
 * Get base esbuild configuration for bundling.
 *
 * @param {string} entryPoint - Entry point path
 * @param {string} outfile - Output file path
 * @param {object} packageOpts - Package-specific options
 * @returns {object} esbuild configuration
 */
export function getEsbuildConfig(entryPoint, outfile, packageOpts = {}) {
  return {
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile,
    external: [
      'node:*',
      'fs',
      'path',
      'os',
      'crypto',
      'stream',
      'util',
      'events',
      'child_process',
      'http',
      'https',
      'net',
      'url',
      'zlib',
      'buffer',
      'querystring',
      'string_decoder',
      'tty',
      'assert',
      'perf_hooks',
      'worker_threads',
      'v8',
      'vm',
      '@socketsecurity/registry',
      ...(packageOpts.external || []),
    ],
    plugins: [
      {
        name: 'stub-encoding',
        setup(build) {
          // Stub out encoding and iconv-lite packages.
          build.onResolve({ filter: /^(encoding|iconv-lite)$/ }, args => ({
            path: args.path,
            namespace: 'stub-encoding',
          }))

          build.onLoad({ filter: /.*/, namespace: 'stub-encoding' }, () => ({
            contents: 'module.exports = {};',
            loader: 'js',
          }))
        },
      },
    ],
    minify: true,
    sourcemap: false,
    metafile: true,
    logLevel: 'error',
    treeShaking: true,
    // Keep function names for better error messages.
    keepNames: true,
    // Additional optimizations:
    pure: ['console.log', 'console.debug', 'console.warn'],
    drop: ['debugger', 'console'],
    ignoreAnnotations: false,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    // Define compile-time constants for dead code elimination.
    define: {
      'process.env.NODE_ENV': '"production"',
      __DEV__: 'false',
      'global.GENTLY': 'false',
      'process.env.DEBUG': 'undefined',
      'process.browser': 'false',
      'process.env.VERBOSE': 'false',
      window: 'undefined',
      document: 'undefined',
      navigator: 'undefined',
      HTMLElement: 'undefined',
      localStorage: 'undefined',
      sessionStorage: 'undefined',
      XMLHttpRequest: 'undefined',
      WebSocket: 'undefined',
      __TEST__: 'false',
      'process.env.CI': 'false',
      __JEST__: 'false',
      __MOCHA__: 'false',
      'process.env.JEST_WORKER_ID': 'undefined',
      'process.env.NODE_TEST': 'undefined',
      ...packageOpts.define,
    },
    charset: 'utf8',
  }
}
