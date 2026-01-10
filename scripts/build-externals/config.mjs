/**
 * @fileoverview External package configuration.
 * Defines which packages need bundling and their scopes.
 */

// Define which packages need bundling (ones that are actual npm packages).
export const externalPackages = [
  // external-pack: Shared dependencies and @inquirer packages bundled together.
  // Bundled first so npm-pack can mark shared deps as external.
  // Contains: has-flag, signal-exit, supports-color, yoctocolors-cjs, @inquirer/*.
  { name: 'external-pack', bundle: true },
  // NPM bundles - grouped for better deduplication.
  // npm-pack: arborist, cacache, libnpmpack, make-fetch-happen, npm-package-arg,
  // normalize-package-data, pacote, semver, validate-npm-package-name.
  { name: 'npm-pack', bundle: true },
  // NPM internals - individual packages now just re-export from bundles (no bundling needed)
  { name: 'cacache', bundle: false },
  { name: 'pacote', bundle: false },
  { name: 'make-fetch-happen', bundle: false },
  { name: 'libnpmexec', bundle: true },
  { name: 'libnpmpack', bundle: false },
  { name: 'npm-package-arg', bundle: false },
  { name: 'normalize-package-data', bundle: false },
  { name: 'semver', bundle: false },
  // Utilities
  { name: 'debug', bundle: true },
  // pico-pack: picomatch, del, fast-glob
  { name: 'pico-pack', bundle: true },
  // pico-pack internals - individual packages now just re-export from pico-pack bundle (no bundling needed)
  { name: 'del', bundle: false },
  { name: 'fast-glob', bundle: false },
  { name: 'fast-sort', bundle: true },
  { name: 'get-east-asian-width', bundle: true },
  { name: 'has-flag', bundle: false },
  { name: 'picomatch', bundle: false },
  // spdx-pack: Bundle spdx-correct, spdx-expression-parse, and dependencies together.
  { name: 'spdx-pack', bundle: true },
  { name: 'spdx-correct', bundle: false },
  { name: 'spdx-expression-parse', bundle: false },
  { name: 'signal-exit', bundle: false },
  { name: 'streaming-iterables', bundle: true },
  { name: 'supports-color', bundle: false },
  { name: 'validate-npm-package-name', bundle: false },
  { name: 'which', bundle: true },
  { name: 'yargs-parser', bundle: true },
  { name: 'yoctocolors-cjs', bundle: false },
  // Used by socket-cli (dist/cli.js has minified zod).
  { name: 'zod', bundle: true },
]

// Scoped packages need special handling.
export const scopedPackages = [
  {
    scope: '@npmcli',
    // arborist re-exports from npm-pack bundle (no separate bundling needed)
    name: 'arborist',
    bundle: false,
  },
  {
    scope: '@npmcli',
    packages: ['package-json', 'promise-spawn'],
    bundle: true,
    subpaths: ['package-json/lib/read-package.js', 'package-json/lib/sort.js'],
  },
  {
    scope: '@inquirer',
    packages: [
      // Only bundle packages that are in devDependencies
      'checkbox',
      'confirm',
      'input',
      'password',
      'search',
      'select',
    ],
    bundle: false,
    optional: true,
  },
  {
    scope: '@socketregistry',
    packages: ['packageurl-js', 'is-unicode-supported', 'yocto-spinner'],
    optional: true,
  },
  { scope: '@yarnpkg', name: 'extensions', bundle: true },
]
