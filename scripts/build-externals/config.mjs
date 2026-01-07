/**
 * @fileoverview External package configuration.
 * Defines which packages need bundling and their scopes.
 */

// Define which packages need bundling (ones that are actual npm packages).
export const externalPackages = [
  // NPM bundles - grouped for better deduplication
  // npm-core: npm-package-arg, normalize-package-data, semver
  { name: 'npm-core', bundle: true },
  // npm-pack: arborist, cacache, libnpmpack, make-fetch-happen, pacote
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
  // inquirer-pack: Bundle all @inquirer packages together.
  { name: 'inquirer-pack', bundle: true },
  { name: 'picomatch', bundle: false },
  { name: 'spdx-correct', bundle: true },
  { name: 'spdx-expression-parse', bundle: true },
  { name: 'streaming-iterables', bundle: true },
  { name: 'validate-npm-package-name', bundle: true },
  { name: 'which', bundle: true },
  { name: 'yargs-parser', bundle: true },
  { name: 'yoctocolors-cjs', bundle: true },
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
