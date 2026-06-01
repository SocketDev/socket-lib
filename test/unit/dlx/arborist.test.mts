/**
 * @file Unit tests for dlx/arborist.ts pure helpers — `getBaseArboristOptions`,
 *   `readSingleDependency`, `readTopLevelFromIdealTree`, `writeSafeNpmrc`. The
 *   wrappers `safeIdealTree` and `safeReify` instantiate Arborist and hit the
 *   registry, so they're covered by integration tests in socket-cli.
 */

import {
  existsSync,
  mkdtempSync,
  promises as fsp,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getBaseArboristOptions,
  readSingleDependency,
  readTopLevelFromIdealTree,
  writeSafeNpmrc,
} from '../../../src/dlx/arborist'
import { safeDelete } from '../../../src/fs/safe'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'arborist-test-'))
})

afterEach(async () => {
  await safeDelete(tmp)
})

describe.sequential('dlx/arborist — getBaseArboristOptions', () => {
  it('pins the security-hardened flags', () => {
    const opts = getBaseArboristOptions('/install', { quiet: true }) as Record<
      string,
      unknown
    >
    expect(opts['path']).toBe('/install')
    expect(opts['audit']).toBe(false)
    expect(opts['fund']).toBe(false)
    expect(opts['ignoreScripts']).toBe(true)
    expect(opts['progress']).toBe(false)
    expect(opts['save']).toBe(false)
    expect(opts['saveBundle']).toBe(false)
    expect(opts['silent']).toBe(true)
  })

  it('honors quiet=false to surface logs', () => {
    const opts = getBaseArboristOptions('/i', { quiet: false }) as Record<
      string,
      unknown
    >
    expect(opts['silent']).toBe(false)
  })

  it('null-prototype object (no inherited keys)', () => {
    const opts = getBaseArboristOptions('/x', { quiet: true })
    expect(Object.getPrototypeOf(opts)).toBeNull()
  })
})

describe.sequential('dlx/arborist — readSingleDependency', () => {
  it('returns the only dependency name', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(
      pkgPath,
      JSON.stringify({ dependencies: { 'is-number': '^7.0.0' } }),
    )
    expect(readSingleDependency(pkgPath)).toBe('is-number')
  })

  it('throws on zero dependencies', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ dependencies: {} }))
    expect(() => readSingleDependency(pkgPath)).toThrow(
      /expects exactly one top-level dependency/,
    )
  })

  it('throws on multiple dependencies', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ dependencies: { a: '1', b: '2' } }))
    expect(() => readSingleDependency(pkgPath)).toThrow(
      /expects exactly one top-level dependency/,
    )
  })

  it('treats missing dependencies field as zero', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'no-deps' }))
    expect(() => readSingleDependency(pkgPath)).toThrow(
      /expects exactly one top-level dependency/,
    )
  })
})

describe.sequential('dlx/arborist — readTopLevelFromIdealTree', () => {
  const makeTree = (
    nodes: Array<{
      name?: string | undefined
      version?: string | undefined
      integrity?: string | undefined
      depth?: number | undefined
      isProjectRoot?: boolean | undefined
    }>,
  ) => ({ inventory: new Map(nodes.map((n, i) => [String(i), n])) })

  it('returns the depth=1 node matching targetName', () => {
    const tree = makeTree([
      { isProjectRoot: true, depth: 0 },
      {
        name: 'is-number',
        version: '7.0.0',
        integrity: 'sha512-abc=',
        depth: 1,
      },
    ])
    expect(readTopLevelFromIdealTree(tree, 'is-number')).toEqual({
      name: 'is-number',
      version: '7.0.0',
      integrity: 'sha512-abc=',
    })
  })

  it('skips nested nodes at depth > 1 with the same name', () => {
    const tree = makeTree([
      {
        name: 'is-number',
        version: '6.0.0',
        integrity: 'sha512-old=',
        depth: 2,
      },
      {
        name: 'is-number',
        version: '7.0.0',
        integrity: 'sha512-new=',
        depth: 1,
      },
    ])
    expect(readTopLevelFromIdealTree(tree, 'is-number').version).toBe('7.0.0')
  })

  it('throws when the target name is not found', () => {
    const tree = makeTree([
      { name: 'other', version: '1.0.0', integrity: 'x', depth: 1 },
    ])
    expect(() => readTopLevelFromIdealTree(tree, 'absent')).toThrow(
      /no top-level node for absent/,
    )
  })

  it('throws when the depth=1 match is missing version', () => {
    const tree = makeTree([{ name: 'pkg', integrity: 'x', depth: 1 }])
    expect(() => readTopLevelFromIdealTree(tree, 'pkg')).toThrow(
      /missing version\/integrity/,
    )
  })

  it('throws when the depth=1 match is missing integrity', () => {
    const tree = makeTree([{ name: 'pkg', version: '1.0.0', depth: 1 }])
    expect(() => readTopLevelFromIdealTree(tree, 'pkg')).toThrow(
      /missing version\/integrity/,
    )
  })

  it('throws when inventory is missing entirely', () => {
    expect(() => readTopLevelFromIdealTree({}, 'pkg')).toThrow(
      /missing inventory/,
    )
  })

  it('throws when tree is null', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- callers may pass null; tested explicitly.
    expect(() => readTopLevelFromIdealTree(null, 'pkg')).toThrow(
      /missing inventory/,
    )
  })

  it('skips isProjectRoot:true nodes even at depth=1', () => {
    const tree = makeTree([
      {
        name: 'is-number',
        isProjectRoot: true,
        version: '7.0.0',
        integrity: 'x',
        depth: 1,
      },
      {
        name: 'is-number',
        version: '8.0.0',
        integrity: 'y',
        depth: 1,
      },
    ])
    expect(readTopLevelFromIdealTree(tree, 'is-number').version).toBe('8.0.0')
  })
})

describe.sequential('dlx/arborist — writeSafeNpmrc', () => {
  async function read(installPath: string) {
    return readFileSync(path.join(installPath, '.npmrc'), 'utf8')
  }

  it('writes the hardened baseline (no release-age opts)', async () => {
    await writeSafeNpmrc(tmp)
    const content = await read(tmp)
    expect(content).toContain('ignore-scripts=true')
    expect(content).toContain('audit=false')
    expect(content).toContain('fund=false')
    expect(content).toContain('save=false')
    expect(content).toContain('save-bundle=false')
    expect(content).toContain('progress=false')
    expect(content).not.toContain('min-release-age')
    expect(content).not.toContain('minimum-release-age')
  })

  it('appends npm-style min-release-age when minReleaseDays is set', async () => {
    await writeSafeNpmrc(tmp, { minReleaseDays: 7 })
    expect(await read(tmp)).toContain('min-release-age=7')
  })

  it('appends pnpm-style minimum-release-age when minReleaseMins is set', async () => {
    await writeSafeNpmrc(tmp, { minReleaseMins: 1440 })
    expect(await read(tmp)).toContain('minimum-release-age=1440')
  })

  it('rejects mutually-exclusive minRelease* options', async () => {
    await expect(
      writeSafeNpmrc(tmp, { minReleaseDays: 7, minReleaseMins: 1440 }),
    ).rejects.toThrow(/mutually exclusive/)
  })

  it('does not throw on a fresh install dir (just writes .npmrc)', async () => {
    const fresh = path.join(tmp, 'sub')
    await fsp.mkdir(fresh, { recursive: true })
    await writeSafeNpmrc(fresh)
    expect(existsSync(path.join(fresh, '.npmrc'))).toBe(true)
  })
})
