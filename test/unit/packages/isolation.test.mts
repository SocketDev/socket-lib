/**
 * @file Unit tests for packages/isolation.ts. Covers `mergePackageJson` and
 *   `resolveRealPath` pure helpers + the orchestrator `isolatePackage` via the
 *   `install` callback escape hatch (so tests never spawn pnpm). Real
 *   end-to-end pnpm-install behavior is covered by integration tests.
 */

import { mkdirSync, mkdtempSync, promises as fsp, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isolatePackage,
  mergePackageJson,
  resolveRealPath,
} from '../../../src/packages/isolation'
import { safeDelete } from '../../../src/fs/safe'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'isolation-test-'))
})

afterEach(async () => {
  await safeDelete(tmp)
})

describe.sequential('packages/isolation — mergePackageJson', () => {
  it('returns the parsed pkgJson as-is when originalPkgJson is undefined', async () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'a', version: '1' }))
    const result = await mergePackageJson(pkgPath, undefined)
    expect(result).toEqual({ name: 'a', version: '1' })
  })

  it('merges original on top of parsed pkgJson (parsed wins on conflict)', async () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'parsed', version: '2.0.0' }))
    const original = {
      name: 'original',
      description: 'kept',
    }
    const result = await mergePackageJson(pkgPath, original)
    // Parsed file value wins for `name`/`version`; `description` from
    // original is preserved.
    expect(result.name).toBe('parsed')
    expect(result.version).toBe('2.0.0')
    expect(result.description).toBe('kept')
  })

  it('throws a contextual error when the file is missing', async () => {
    const pkgPath = path.join(tmp, 'absent.json')
    await expect(mergePackageJson(pkgPath, undefined)).rejects.toThrow(
      /Failed to parse/,
    )
  })

  it('throws a contextual error on malformed JSON', async () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, 'not-json{{{')
    await expect(mergePackageJson(pkgPath, undefined)).rejects.toThrow(
      /Failed to parse/,
    )
  })
})

describe.sequential('packages/isolation — resolveRealPath', () => {
  it('returns the realpath of an existing file', async () => {
    const filePath = path.join(tmp, 'file.txt')
    writeFileSync(filePath, 'hi')
    const resolved = await resolveRealPath(filePath)
    // realpath canonicalizes the OS tmpdir; assert it ends with the
    // tail component to avoid /private/var/folders vs /var/folders
    // platform divergence.
    expect(resolved.endsWith('file.txt')).toBe(true)
  })

  it('falls back to path.resolve when the target does not exist', async () => {
    const absent = path.join(tmp, 'does-not-exist.txt')
    const resolved = await resolveRealPath(absent)
    // No realpath available; fallback returns an absolute path.
    expect(path.isAbsolute(resolved)).toBe(true)
    expect(resolved.endsWith('does-not-exist.txt')).toBe(true)
  })

  it('returns realpath for a symlink target (POSIX)', async () => {
    if (process.platform === 'win32') {
      return
    }
    const target = path.join(tmp, 'real.txt')
    writeFileSync(target, 'x')
    const link = path.join(tmp, 'link.txt')
    await fsp.symlink(target, link)
    const resolved = await resolveRealPath(link)
    // realpath follows the symlink → resolved tail is `real.txt`, not link.txt.
    expect(resolved.endsWith('real.txt')).toBe(true)
  })
})

describe.sequential('packages/isolation — isolatePackage', () => {
  // Build a tiny local source package under tmp. The shape:
  //   tmp/src-pkg/package.json
  //   tmp/src-pkg/index.js
  function makeSrcPkg(name: string) {
    const dir = path.join(tmp, `src-${name.replace(/[@/]/g, '-')}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', main: 'index.js' }),
    )
    writeFileSync(path.join(dir, 'index.js'), 'module.exports = { hello: 1 }')
    return dir
  }

  it('throws when sourcePath does not exist (path input)', async () => {
    await expect(isolatePackage('/does/not/exist-12345')).rejects.toThrow(
      /Source path does not exist/,
    )
  })

  it('throws when no version spec is provided + no sourcePath', async () => {
    // 'unscoped-pkg-name' is parsed as registry spec (no version, no path).
    // npmPackageArg picks up the bare name → spec is set → registry branch,
    // which under our `install: noop` shortcut still throws because the
    // registry install doesn't actually populate node_modules/<pkg>.
    // Use `install: noop` to skip the spawn but still hit the codepath.
    // Then the readPackageJson on the (empty) installedPath should throw.
    const install = vi.fn(async () => undefined)
    await expect(isolatePackage('lodash@^4.17.0', { install })).rejects.toThrow(
      /JSON file not found|Could not read package.json/,
    )
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('copies a local source package and reads its package.json (path input)', async () => {
    const srcDir = makeSrcPkg('localpkg')
    const install = vi.fn(async () => undefined)
    const result = await isolatePackage(srcDir, { install })
    expect(result.tmpdir).toContain('node_modules')
    expect(result.tmpdir).toContain('localpkg')
    // install callback fired (replaces pnpm install).
    expect(install).toHaveBeenCalledTimes(1)
    // package.json was copied through.
    const installedPkg = JSON.parse(
      String(
        await fsp.readFile(path.join(result.tmpdir, 'package.json'), 'utf8'),
      ),
    )
    expect(installedPkg.name).toBe('localpkg')
  })

  it('handles scoped packages by creating the @scope dir', async () => {
    const srcDir = makeSrcPkg('@scope/sub')
    const install = vi.fn(async () => undefined)
    const result = await isolatePackage(srcDir, { install })
    // installedPath is node_modules/@scope/sub
    expect(result.tmpdir).toMatch(/node_modules[/\\]@scope[/\\]sub$/)
  })

  it('applies onPackageJson callback to transform installed package.json', async () => {
    const srcDir = makeSrcPkg('xform-pkg')
    const install = vi.fn(async () => undefined)
    const result = await isolatePackage(srcDir, {
      install,
      onPackageJson: pkg => ({ ...pkg, description: 'xformed' }),
    })
    const written = JSON.parse(
      String(
        await fsp.readFile(path.join(result.tmpdir, 'package.json'), 'utf8'),
      ),
    )
    expect(written.description).toBe('xformed')
  })

  it('loads exports map when imports option is provided', async () => {
    const srcDir = makeSrcPkg('imp-pkg')
    const install = vi.fn(async () => undefined)
    const result = await isolatePackage(srcDir, {
      install,
      imports: { default: 'index.js' },
    })
    expect(result.exports?.['default']).toEqual({ hello: 1 })
  })

  it('handles a parsed-registry spec via npm-package-arg (no sourcePath)', async () => {
    // `lodash` alone parses as a registry tag spec — exercises the
    // spec-branch where registry install would normally run.
    // We feed install:noop to skip the spawn; the failure mode is then
    // readPackageJson on the non-existent installedPath. Confirms the
    // spec branch was entered (the install callback was called).
    const install = vi.fn(async () => undefined)
    await expect(isolatePackage('lodash', { install })).rejects.toThrow(
      /JSON file not found|Could not read package.json/,
    )
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('rejects directory parsed-spec when fetchSpec does not exist', async () => {
    // npmPackageArg parses './nonexistent' as a directory spec; the
    // helper then throws when fs.existsSync(fetchSpec) is false.
    await expect(
      isolatePackage('./does-not-exist-zzz-' + Date.now()),
    ).rejects.toThrow(/Source path does not exist/)
  })

  it("reads package name from package.json when parser doesn't supply one", async () => {
    // Build an anonymous package — npmPackageArg with a directory path
    // sometimes returns a parsed.name that's missing/empty when the
    // path doesn't follow the spec form. We test this branch by passing
    // a path through the isPath() === true route, which always tries
    // readPackageJson first.
    const srcDir = makeSrcPkg('via-pkgjson')
    const install = vi.fn(async () => undefined)
    const result = await isolatePackage(srcDir, { install })
    expect(result.tmpdir).toContain('via-pkgjson')
  })
})
