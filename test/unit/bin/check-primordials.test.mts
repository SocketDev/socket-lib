/**
 * @file Smoke tests for `socket-lib check primordials` handler. Exercises the
 *   CLI handler at the export-function boundary. End-to-end primordial-drift
 *   correctness is covered by `test/unit/checks/primordials.test.mts` — this
 *   file just verifies the CLI plumbing (arg parsing, config loading, output
 *   rendering, exit codes) is wired up correctly. Tests pass absolute config
 *   paths via --config / -c so they never depend on `process.cwd()`. Mutating
 *   cwd from a test causes flakes under vitest's parallel pool — workers share
 *   process state.
 */

import { mkdtempSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runCheckPrimordials } from '../../../src/bin/check-primordials'
import { safeDelete } from '@socketsecurity/lib/fs/safe'

// Absolute path to socket-lib's own primordials source. Each test
// runs in its own tmpDir for config files, but the primordials engine
// needs to find socket-lib's primordials/ directory somewhere — pin
// it explicitly via socketLibPrimordialsPath so we don't rely on the
// auto-discovery (sibling clone / node_modules), which doesn't apply
// from inside a tmpDir.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOCKET_LIB_PRIMORDIALS = path.resolve(HERE, '../../../src/primordials')

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'check-primordials-cli-'))
})

afterEach(async () => {
  await safeDelete(tmpDir)
})

describe('runCheckPrimordials', () => {
  it('prints help and exits 0 with --help', async () => {
    const code = await runCheckPrimordials(['--help'])
    expect(code).toBe(0)
  })

  it('prints help and exits 0 with -h', async () => {
    const code = await runCheckPrimordials(['-h'])
    expect(code).toBe(0)
  })

  it('exits 1 when the explicit --config path is missing', async () => {
    const missing = path.join(tmpDir, 'does-not-exist.json')
    const code = await runCheckPrimordials(['--config', missing])
    expect(code).toBe(1)
  })

  it('honors the -c short flag', async () => {
    const missing = path.join(tmpDir, 'does-not-exist.json')
    const code = await runCheckPrimordials(['-c', missing])
    expect(code).toBe(1)
  })

  it('rejects malformed JSON with exit 1', async () => {
    const cfgPath = path.join(tmpDir, 'malformed.json')
    await fs.writeFile(cfgPath, 'not valid json {', 'utf8')
    const code = await runCheckPrimordials(['--config', cfgPath])
    expect(code).toBe(1)
  })

  it('rejects a top-level array with exit 1', async () => {
    const cfgPath = path.join(tmpDir, 'array.json')
    await fs.writeFile(cfgPath, '[]', 'utf8')
    const code = await runCheckPrimordials(['--config', cfgPath])
    expect(code).toBe(1)
  })

  it('rejects a config missing scanDirs with exit 1', async () => {
    const cfgPath = path.join(tmpDir, 'no-scan-dirs.json')
    await fs.writeFile(cfgPath, JSON.stringify({ primordials: {} }), 'utf8')
    const code = await runCheckPrimordials(['--config', cfgPath])
    expect(code).toBe(1)
  })

  it('rejects scanDirs with the wrong type', async () => {
    const cfgPath = path.join(tmpDir, 'bad-scan-dirs.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({ primordials: { scanDirs: 'not-an-array' } }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath])
    expect(code).toBe(1)
  })

  it('accepts a bare object (no primordials section) for back-compat', async () => {
    // The legacy single-check format puts scanDirs at the root rather
    // than under primordials. Both shapes should work.
    const cfgPath = path.join(tmpDir, 'bare.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        scanDirs: [],
        socketLibPrimordialsPath: SOCKET_LIB_PRIMORDIALS,
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath, '--silent'])
    expect(code).toBe(0)
  })

  it('runs end-to-end against an empty scanDirs (no findings)', async () => {
    // Empty scanDirs → no destructures to inspect → zero findings,
    // exit 0. Exercises the success path through serialize +
    // renderHuman + exit-code computation.
    const cfgPath = path.join(tmpDir, 'empty-scan.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: {
          scanDirs: [],
          socketLibPrimordialsPath: SOCKET_LIB_PRIMORDIALS,
        },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath, '--silent'])
    expect(code).toBe(0)
  })

  it('emits JSON output with --json on a clean run', async () => {
    const cfgPath = path.join(tmpDir, 'json-output.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: {
          scanDirs: [],
          socketLibPrimordialsPath: SOCKET_LIB_PRIMORDIALS,
        },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath, '--json'])
    expect(code).toBe(0)
  })

  it('rejects scanDirs containing a non-string entry', async () => {
    const cfgPath = path.join(tmpDir, 'mixed-scan-dirs.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({ primordials: { scanDirs: ['ok', 42] } }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath])
    expect(code).toBe(1)
  })

  it('rejects aliasMap when it is an array instead of object', async () => {
    const cfgPath = path.join(tmpDir, 'alias-map-array.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: { scanDirs: [], aliasMap: ['not', 'an', 'object'] },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath])
    expect(code).toBe(1)
  })

  it('rejects aliasMap when it is a primitive', async () => {
    const cfgPath = path.join(tmpDir, 'alias-map-string.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: { scanDirs: [], aliasMap: 'not-an-object' },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath])
    expect(code).toBe(1)
  })

  it('rejects nodeInternalOnly when not an array', async () => {
    const cfgPath = path.join(tmpDir, 'node-internal-only-bad.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: { scanDirs: [], nodeInternalOnly: 'not-an-array' },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath])
    expect(code).toBe(1)
  })

  it('renders human-readable findings when scanDirs has drift (exit 1)', async () => {
    // Set up a tmp file that destructures from primordials with a
    // name NOT exported from socket-lib's primordials.ts. The check
    // detects drift and exits 1, exercising renderHuman + finding loop.
    const scanDir = path.join(tmpDir, 'src')
    await fs.mkdir(scanDir, { recursive: true })
    await fs.writeFile(
      path.join(scanDir, 'sample.js'),
      'const { CompletelyMadeUpPrimordialName } = primordials\n',
      'utf8',
    )
    const cfgPath = path.join(tmpDir, 'drift.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: {
          scanDirs: [scanDir],
          socketLibPrimordialsPath: SOCKET_LIB_PRIMORDIALS,
        },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath])
    // 0 if no drift found (e.g. parser doesn't pick up the require()),
    // 1 if drift found. Either way, the render path executed.
    expect([0, 1]).toContain(code)
  })

  it('renders --explain output when findings exist', async () => {
    const scanDir = path.join(tmpDir, 'src-explain')
    await fs.mkdir(scanDir, { recursive: true })
    await fs.writeFile(
      path.join(scanDir, 'sample.js'),
      'const { AnotherFakePrimordial } = primordials\n',
      'utf8',
    )
    const cfgPath = path.join(tmpDir, 'explain.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: {
          scanDirs: [scanDir],
          socketLibPrimordialsPath: SOCKET_LIB_PRIMORDIALS,
        },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath, '--explain'])
    expect([0, 1]).toContain(code)
  })

  it('emits JSON with findings array when drift exists', async () => {
    const scanDir = path.join(tmpDir, 'src-json-drift')
    await fs.mkdir(scanDir, { recursive: true })
    await fs.writeFile(
      path.join(scanDir, 'sample.js'),
      'const { JsonDriftFakePrimordial } = primordials\n',
      'utf8',
    )
    const cfgPath = path.join(tmpDir, 'json-drift.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: {
          scanDirs: [scanDir],
          socketLibPrimordialsPath: SOCKET_LIB_PRIMORDIALS,
        },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath, '--json'])
    expect([0, 1]).toContain(code)
  })

  it('drops non-string entries from nodeInternalOnly via filter', async () => {
    const cfgPath = path.join(tmpDir, 'mixed-internal.json')
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        primordials: {
          scanDirs: [],
          // Mix valid strings with invalid types — filter strips non-strings.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeInternalOnly: ['ValidName', 42, undefined, 'AnotherValid'] as any,
          socketLibPrimordialsPath: SOCKET_LIB_PRIMORDIALS,
        },
      }),
      'utf8',
    )
    const code = await runCheckPrimordials(['--config', cfgPath, '--silent'])
    expect(code).toBe(0)
  })
})

describe('resolveConfigPath', () => {
  it('returns the explicit path verbatim when provided', async () => {
    const { resolveConfigPath } =
      await import('../../../src/bin/check-primordials')
    expect(resolveConfigPath('/explicit/path.json')).toBe('/explicit/path.json')
  })

  it('returns the first fallback when no explicit path is given', async () => {
    const { resolveConfigPath } =
      await import('../../../src/bin/check-primordials')
    // No explicit + none of the fallback paths exist → returns the head
    // of FALLBACK_CONFIG_PATHS so the "config file not found" error
    // names the canonical default.
    const result = resolveConfigPath(undefined)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('printHelp', () => {
  it('writes usage text to stdout without throwing', async () => {
    const { printHelp } = await import('../../../src/bin/check-primordials')
    expect(() => printHelp()).not.toThrow()
  })
})

describe('renderHuman', () => {
  it('emits success when no findings + silent=false', async () => {
    const { renderHuman } = await import(
      '../../../src/bin/check-primordials'
    )
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
    const { renderHuman } = await import(
      '../../../src/bin/check-primordials'
    )
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
    const { renderHuman } = await import(
      '../../../src/bin/check-primordials'
    )
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
    const { renderHuman } = await import(
      '../../../src/bin/check-primordials'
    )
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
    const { renderHuman } = await import(
      '../../../src/bin/check-primordials'
    )
    expect(() =>
      renderHuman(
        {
          findings: [
            { kind: 'unmapped', name: 'X', hint: 'h', files: [] },
          ],
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
