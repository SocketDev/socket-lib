/**
 * @file CLI plumbing shards for `socket-lib check primordials`: config-path
 *   resolution, help rendering, and human-readable output. Split from
 *   check-primordials.test.mts along describe seams (500-line soft cap); the
 *   handler-boundary smoke tests stay in the base file.
 */

import { mkdtempSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('resolveConfigPath', () => {
  it('returns the explicit path verbatim when provided', async () => {
    const { resolveConfigPath } =
      await import('../../../src/cli/check-primordials')
    expect(resolveConfigPath('/explicit/path.json')).toBe('/explicit/path.json')
  })

  it('the fallback list is root, .config/, then the fleet-segmented .config/repo/, in order', async () => {
    const { FALLBACK_CONFIG_PATHS } =
      await import('../../../src/cli/check-primordials')
    expect([...FALLBACK_CONFIG_PATHS]).toStrictEqual([
      '.socket-lib.json',
      '.config/socket-lib.json',
      '.config/repo/socket-lib.json',
    ])
  })

  // Hermetic fixture: seed only the given relative config paths under a temp
  // baseDir, so each fallback branch is exercised without touching cwd.
  async function seedBaseDir(present: readonly string[]): Promise<string> {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'prim-cfg-'))
    for (const rel of present) {
      const abs = path.join(dir, rel)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, '{}\n')
    }
    return dir
  }

  it('resolves the root .socket-lib.json when present', async () => {
    const { resolveConfigPath } =
      await import('../../../src/cli/check-primordials')
    const dir = await seedBaseDir(['.socket-lib.json'])
    expect(resolveConfigPath(undefined, dir)).toBe('.socket-lib.json')
  })

  it('falls through to .config/socket-lib.json when the root dotfile is absent', async () => {
    const { resolveConfigPath } =
      await import('../../../src/cli/check-primordials')
    const dir = await seedBaseDir(['.config/socket-lib.json'])
    expect(resolveConfigPath(undefined, dir)).toBe('.config/socket-lib.json')
  })

  it('falls through to the fleet-segmented .config/repo/socket-lib.json when the earlier two are absent', async () => {
    const { resolveConfigPath } =
      await import('../../../src/cli/check-primordials')
    const dir = await seedBaseDir(['.config/repo/socket-lib.json'])
    expect(resolveConfigPath(undefined, dir)).toBe(
      '.config/repo/socket-lib.json',
    )
  })

  it('prefers the root dotfile over both .config/ locations when several exist', async () => {
    const { resolveConfigPath } =
      await import('../../../src/cli/check-primordials')
    const dir = await seedBaseDir([
      '.socket-lib.json',
      '.config/socket-lib.json',
      '.config/repo/socket-lib.json',
    ])
    expect(resolveConfigPath(undefined, dir)).toBe('.socket-lib.json')
  })

  it('prefers .config/socket-lib.json over .config/repo/ when the root is absent', async () => {
    const { resolveConfigPath } =
      await import('../../../src/cli/check-primordials')
    const dir = await seedBaseDir([
      '.config/socket-lib.json',
      '.config/repo/socket-lib.json',
    ])
    expect(resolveConfigPath(undefined, dir)).toBe('.config/socket-lib.json')
  })

  it('returns the canonical head when none of the fallbacks exist', async () => {
    const { resolveConfigPath } =
      await import('../../../src/cli/check-primordials')
    const dir = await seedBaseDir([])
    expect(resolveConfigPath(undefined, dir)).toBe('.socket-lib.json')
  })

  it('returns the explicit path verbatim regardless of baseDir', async () => {
    const { resolveConfigPath } =
      await import('../../../src/cli/check-primordials')
    const dir = await seedBaseDir(['.config/repo/socket-lib.json'])
    expect(resolveConfigPath('/explicit/x.json', dir)).toBe('/explicit/x.json')
  })
})

describe('printHelp', () => {
  it('writes usage text to stdout without throwing', async () => {
    const { printHelp } = await import('../../../src/cli/check-primordials')
    expect(() => printHelp()).not.toThrow()
  })
})

describe('renderHuman', () => {
  it('emits success when no findings + silent=false', async () => {
    const { renderHuman } = await import('../../../src/cli/check-primordials')
    expect(() =>
      renderHuman(
        {
          findings: [],
          used: new Set(['Foo']),
          unused: new Set(),
        } as unknown as Parameters<typeof renderHuman>[0],
        {
          config: undefined,
          json: false,
          explain: false,
          silent: false,
          help: false,
        },
      ),
    ).not.toThrow()
  })

  it('emits nothing when silent + no findings', async () => {
    const { renderHuman } = await import('../../../src/cli/check-primordials')
    expect(() =>
      renderHuman(
        {
          findings: [],
          used: new Set(),
          unused: new Set(),
        } as unknown as Parameters<typeof renderHuman>[0],
        {
          config: undefined,
          json: false,
          explain: false,
          silent: true,
          help: false,
        },
      ),
    ).not.toThrow()
  })

  it('renders findings with hint when --explain is set', async () => {
    const { renderHuman } = await import('../../../src/cli/check-primordials')
    expect(() =>
      renderHuman(
        {
          findings: [
            {
              kind: 'unmapped',
              name: 'BadName',
              hint: 'no mapping; pick one of A/B/C',
              files: ['src/a.js', 'src/b.js'],
            },
          ],
          used: new Set(['BadName']),
          unused: new Set(),
        } as unknown as Parameters<typeof renderHuman>[0],
        {
          config: undefined,
          json: false,
          explain: true,
          silent: false,
          help: false,
        },
      ),
    ).not.toThrow()
  })

  it('renders findings without files when files list is empty', async () => {
    const { renderHuman } = await import('../../../src/cli/check-primordials')
    expect(() =>
      renderHuman(
        {
          findings: [
            {
              kind: 'unmapped',
              name: 'Name',
              hint: 'h',
              files: [],
            },
          ],
          used: new Set(['Name']),
          unused: new Set(),
        } as unknown as Parameters<typeof renderHuman>[0],
        {
          config: undefined,
          json: false,
          explain: true,
          silent: false,
          help: false,
        },
      ),
    ).not.toThrow()
  })

  it('emits trailing "run with --explain" hint when not explaining', async () => {
    const { renderHuman } = await import('../../../src/cli/check-primordials')
    expect(() =>
      renderHuman(
        {
          findings: [{ kind: 'unmapped', name: 'X', hint: 'h', files: [] }],
          used: new Set(['X']),
          unused: new Set(),
        } as unknown as Parameters<typeof renderHuman>[0],
        {
          config: undefined,
          json: false,
          explain: false,
          silent: false,
          help: false,
        },
      ),
    ).not.toThrow()
  })
})
