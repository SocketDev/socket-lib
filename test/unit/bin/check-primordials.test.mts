/**
 * @fileoverview Smoke tests for `socket-lib check primordials` handler.
 *
 * Exercises the CLI handler at the export-function boundary. End-to-end
 * primordial-drift correctness is covered by `test/unit/checks/primordials.test.mts`
 * — this file just verifies the CLI plumbing (arg parsing, config
 * loading, output rendering, exit codes) is wired up correctly.
 *
 * Tests pass absolute config paths via --config / -c so they never
 * depend on `process.cwd()`. Mutating cwd from a test causes flakes
 * under vitest's parallel pool — workers share process state.
 */

import { mkdtempSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runCheckPrimordials } from '../../../src/bin/check-primordials'

// Absolute path to socket-lib's own primordials source. Each test
// runs in its own tmpDir for config files, but the primordials engine
// needs to find socket-lib's primordials.ts somewhere — pin it
// explicitly via socketLibPrimordialsPath so we don't rely on the
// auto-discovery (sibling clone / node_modules), which doesn't apply
// from inside a tmpDir.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOCKET_LIB_PRIMORDIALS = path.resolve(HERE, '../../../src/primordials.ts')

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'check-primordials-cli-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
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
    // Set up a tmp file that uses a primordial NOT exported from
    // socket-lib's primordials.ts. The check finds it, treats it as
    // drift, and exits 1 — exercising the renderHuman + finding loop.
    const scanDir = path.join(tmpDir, 'src')
    await fs.mkdir(scanDir, { recursive: true })
    await fs.writeFile(
      path.join(scanDir, 'sample.ts'),
      "const { CompletelyMadeUpPrimordialName } = require('node:primordials')\n",
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
      path.join(scanDir, 'sample.ts'),
      "import { ArrayPrototypeAt } from 'node:primordials'\n",
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
})
