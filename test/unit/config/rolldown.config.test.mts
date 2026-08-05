/**
 * @file Tests for the main build's `external()` predicate. It must externalize
 *   bare specifiers (deps) and THIS repo's own `src/external/*` shims — and
 *   nothing else. A blanket `external/`-segment match also catches a
 *   dependency's nested `dist/external/*` (an inlined package vendoring its
 *   own externals), externalizing modules that were meant to be bundled and
 *   emitting relative requires into files that don't exist next to the
 *   output — the class of break that shipped socket-cli 1.1.151's
 *   "Cannot find module 'form-data'".
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildConfig } from '../../../.config/rolldown.config.mts'

const rootPath = path.resolve(import.meta.dirname, '../../..')
const srcPath = path.join(rootPath, 'src')

const external = buildConfig.external as (
  id: string,
  importer?: string | undefined,
) => boolean

describe('main build external() predicate', () => {
  it('externalizes bare specifiers', () => {
    expect(external('semver')).toBe(true)
    expect(external('@socketsecurity/lib-stable/env/boolean')).toBe(true)
  })

  it('externalizes own src/external shims by relative import', () => {
    const importer = path.join(srcPath, 'globs/shared.ts')
    expect(external('../external/fast-glob.js', importer)).toBe(true)
    expect(external('../external/picomatch.js', importer)).toBe(true)
  })

  it('externalizes own src/external shims by absolute path', () => {
    expect(external(path.join(srcPath, 'external/semver.js'))).toBe(true)
  })

  it('bundles ordinary relative imports', () => {
    const importer = path.join(srcPath, 'globs/shared.ts')
    expect(external('./defaults', importer)).toBe(false)
    expect(external('../paths/normalize', importer)).toBe(false)
  })

  it("does NOT externalize a dependency's nested dist/external", () => {
    // The regression pin: these carry an `external/` segment but live inside
    // node_modules, not this repo's src/external.
    const nested = path.join(
      rootPath,
      'node_modules/@socketsecurity/lib/dist/external/pony-cause.js',
    )
    expect(external(nested)).toBe(false)
    const importerInDep = path.join(
      rootPath,
      'node_modules/@socketsecurity/lib/dist/cacache/shared.js',
    )
    expect(external('../external/cacache', importerInDep)).toBe(false)
  })

  it('does not externalize a relative external path with no importer', () => {
    // Unresolvable relative id: bundling (false) is the safe default; the
    // entry map never feeds relative ids without importers in practice.
    expect(external('../external/fast-glob.js')).toBe(false)
  })
})
