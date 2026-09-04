/**
 * @file The registry half of `isolatePackage` — the branch taken when the spec
 *   names a package rather than a directory. Reaching it for real means running
 *   `pnpm add` against the network, so the spawn it calls is mocked with a
 *   stand-in that populates node_modules the way an install would. That makes
 *   the arguments the installer is handed assertable, and lets the
 *   copy-source-over-install step run without a registry. The sibling
 *   isolation spec covers the local-copy branch and the pure helpers.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '../../../src/fs/safe.mjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted so the mock factory, which runs before this module body, sees an
// initialized spy. The default implementation stands in for `pnpm add`: it
// creates the package directory under node_modules that the caller reads its
// original manifest from, because an install that leaves node_modules empty is
// not a shape isolatePackage is written for.
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock(import('../../../src/process/spawn/child.mjs'), async orig => {
  const actual = await orig()
  return {
    ...actual,
    // `spawn` is overloaded for string and Buffer output; one spy signature
    // cannot satisfy every overload, so the stand-in is asserted into place.
    spawn: spawn as unknown as typeof actual.spawn,
  }
})

import { isolatePackage } from '../../../src/packages/isolation.mjs'

const tmpDirs: string[] = []

function tmpRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'isolation-registry-'))
  tmpDirs.push(root)
  return root
}

// A minimal source package on disk.
function sourcePackage(name: string): string {
  const dir = path.join(tmpRoot(), 'source')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ main: 'index.js', name, version: '2.0.0' }),
  )
  writeFileSync(path.join(dir, 'index.js'), 'module.exports = { ok: true }')
  return dir
}

// What `pnpm add <spec>` leaves behind, reduced to the one thing the caller
// reads afterwards: node_modules/<name>/package.json.
function installsInto(packageName: string) {
  return (
    command: string,
    args: readonly string[],
    options: { cwd: string },
  ) => {
    if (args[0] === 'add') {
      const installed = path.join(options.cwd, 'node_modules', packageName)
      mkdirSync(installed, { recursive: true })
      writeFileSync(
        path.join(installed, 'package.json'),
        JSON.stringify({ name: packageName, version: '1.0.0' }),
      )
    }
    return Promise.resolve({ args, cmd: command, code: 0 })
  }
}

// Argv of the nth spawn call.
function spawnArgs(index: number): readonly string[] {
  const call = spawn.mock.calls[index] as unknown as [string, string[]]
  return call[1]
}

beforeEach(() => {
  spawn.mockReset()
})

afterEach(async () => {
  const dirs = tmpDirs.splice(0)
  await Promise.all(dirs.map(dir => safeDelete(dir)))
})

describe('installing from the registry', () => {
  it('adds the package, then installs its dependencies', async () => {
    spawn.mockImplementation(installsInto('example-pkg'))

    const result = await isolatePackage('example-pkg@1.0.0', {
      sourcePath: sourcePackage('example-pkg'),
    })

    expect(spawnArgs(0)).toEqual(['add', 'example-pkg@1.0.0'])
    expect(spawnArgs(1)).toEqual(['install'])
    expect(result.tmpdir).toMatch(/node_modules[/\\]example-pkg$/)
  })

  it('copies the local source over what the registry installed', async () => {
    spawn.mockImplementation(installsInto('example-pkg'))

    const result = await isolatePackage('example-pkg@1.0.0', {
      sourcePath: sourcePackage('example-pkg'),
    })

    // index.js exists only in the source tree, so its presence proves the
    // copy ran on top of the installed package.
    expect(existsSync(path.join(result.tmpdir, 'index.js'))).toBe(true)
  })

  it('merges the installed manifest under the source manifest', async () => {
    spawn.mockImplementation(installsInto('example-pkg'))

    const result = await isolatePackage('example-pkg@1.0.0', {
      sourcePath: sourcePackage('example-pkg'),
    })

    const written = JSON.parse(
      readFileSync(path.join(result.tmpdir, 'package.json'), 'utf8'),
    )
    // The source manifest wins on conflict — it is what was copied last.
    expect(written.version).toBe('2.0.0')
  })

  it('falls back to the raw spec when the parse supplies none', async () => {
    // An alias spec parses with a null fetchSpec, so the raw form is the only
    // thing left to install.
    spawn.mockImplementation(installsInto('example-alias'))

    await isolatePackage('example-alias@npm:other-pkg@1.0.0', {
      sourcePath: sourcePackage('example-alias'),
    })

    expect(spawnArgs(0)).toEqual(['add', 'example-alias@npm:other-pkg@1.0.0'])
  })

  it('skips the copy when the install already points at the source', async () => {
    const source = sourcePackage('example-pkg')
    // A link, the shape a workspace install leaves behind. Copying a directory
    // onto itself throws, so a run that completes proves the copy was skipped.
    const install = vi.fn(async (cwd: string) => {
      const modules = path.join(cwd, 'node_modules')
      mkdirSync(modules, { recursive: true })
      const installed = path.join(modules, 'example-pkg')
      if (!existsSync(installed)) {
        symlinkSync(source, installed)
      }
    })

    const result = await isolatePackage('example-pkg@1.0.0', {
      install,
      sourcePath: source,
    })

    expect(result.tmpdir).toMatch(/node_modules[/\\]example-pkg$/)
    expect(spawn).not.toHaveBeenCalled()
  })
})

describe('specs the isolator refuses', () => {
  it('names the spec it could not pull a package name out of', async () => {
    await expect(
      isolatePackage('git+https://github.com/example-owner/example-repo.git'),
    ).rejects.toThrow(/Could not determine package name from/)
  })

  it('names the directory whose manifest read back empty', async () => {
    const dir = path.join(tmpRoot(), 'empty-manifest')
    mkdirSync(dir, { recursive: true })
    // Valid JSON, but not an object — the read succeeds and yields nothing.
    writeFileSync(path.join(dir, 'package.json'), 'null')

    await expect(isolatePackage(dir)).rejects.toThrow(
      /Could not read package.json from/,
    )
  })

  it('names the file: directory whose manifest read back empty', async () => {
    const dir = path.join(tmpRoot(), 'empty-file-manifest')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'package.json'), 'null')

    await expect(isolatePackage(`file:${dir}`)).rejects.toThrow(
      /Could not read package.json from/,
    )
  })
})
