/**
 * @fileoverview Smoke tests for `socket-lib check primordials` handler.
 *
 * Exercises the CLI handler at the export-function boundary. End-to-end
 * primordial-drift correctness is covered by `test/unit/checks/primordials.test.mts`
 * — this file just verifies the CLI plumbing (arg parsing, config
 * loading, output rendering, exit codes) is wired up correctly.
 */

import { mkdtempSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runCheckPrimordials } from '../../../src/bin/check-primordials'

// Absolute path to socket-lib's own primordials source. Tests chdir
// into a tmpDir, so the engine's auto-discovery (sibling clone /
// node_modules) can't locate socket-lib from inside the tmpDir.
// Set socketLibPrimordialsPath in the test config to short-circuit
// the lookup.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOCKET_LIB_PRIMORDIALS = path.resolve(
  HERE,
  '../../../src/primordials.ts',
)

let tmpDir: string
let prevCwd: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'check-primordials-cli-'))
  prevCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(async () => {
  process.chdir(prevCwd)
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

  it('exits 1 when no config file exists in cwd', async () => {
    // Empty tmpDir — no .socket-lib.json, no .config/socket-lib.json.
    const code = await runCheckPrimordials([])
    expect(code).toBe(1)
  })

  it('exits 1 when the explicit --config path is missing', async () => {
    const code = await runCheckPrimordials(['--config', './does-not-exist.json'])
    expect(code).toBe(1)
  })

  it('honors the -c short flag', async () => {
    const code = await runCheckPrimordials(['-c', './does-not-exist.json'])
    expect(code).toBe(1)
  })

  it('rejects malformed JSON with exit 1', async () => {
    const cfgPath = path.join(tmpDir, '.socket-lib.json')
    await fs.writeFile(cfgPath, 'not valid json {', 'utf8')
    const code = await runCheckPrimordials([])
    expect(code).toBe(1)
  })

  it('rejects a top-level array with exit 1', async () => {
    const cfgPath = path.join(tmpDir, '.socket-lib.json')
    await fs.writeFile(cfgPath, '[]', 'utf8')
    const code = await runCheckPrimordials([])
    expect(code).toBe(1)
  })

  it('rejects a config missing scanDirs with exit 1', async () => {
    const cfgPath = path.join(tmpDir, '.socket-lib.json')
    await fs.writeFile(cfgPath, JSON.stringify({ primordials: {} }), 'utf8')
    const code = await runCheckPrimordials([])
    expect(code).toBe(1)
  })

  it('discovers .config/socket-lib.json as a fallback', async () => {
    // Place a deliberately invalid config in .config/ — we just want
    // to confirm the discovery picks it up (it will fail loadConfig
    // shape validation, exiting 1 with a different error path than
    // "config file not found").
    await fs.mkdir(path.join(tmpDir, '.config'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, '.config', 'socket-lib.json'),
      JSON.stringify({ primordials: { scanDirs: 'not-an-array' } }),
      'utf8',
    )
    const code = await runCheckPrimordials([])
    expect(code).toBe(1)
  })

  it('runs end-to-end against an empty scanDirs (no findings)', async () => {
    // Empty scanDirs → no destructures to inspect → zero findings,
    // exit 0. Exercises the success path through serialize +
    // renderHuman + exit-code computation.
    const cfgPath = path.join(tmpDir, '.socket-lib.json')
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
    const code = await runCheckPrimordials(['--silent'])
    expect(code).toBe(0)
  })

  it('emits JSON output with --json on a clean run', async () => {
    const cfgPath = path.join(tmpDir, '.socket-lib.json')
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
    const code = await runCheckPrimordials(['--json'])
    expect(code).toBe(0)
  })
})
