/**
 * @fileoverview Module-format interop tag for packages.
 *
 *   - `browserify` — bundled for browser consumption (CJS + shims)
 *   - `cjs`        — CommonJS
 *   - `esm`        — ES modules
 */

export type InteropString = 'browserify' | 'cjs' | 'esm'
