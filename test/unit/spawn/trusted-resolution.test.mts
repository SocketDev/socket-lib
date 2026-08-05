/**
 * @file Unit tests for the trusted-resolution glue in
 *   src/process/spawn/shared — resolveSpawnBin, its cache key, and the
 *   end-to-end effect on spawn/spawnSync. Fixtures are real mode-0o755 scripts
 *   under os.tmpdir().
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { readRealPath } from '../../../src/bin/trusted'
import { safeDelete } from '../../../src/fs/safe'
import {
  applyCmdExeStem,
  hasCmdExeShadowInDir,
  resolveSpawnBin,
  spawnBinPathCache,
} from '../../../src/process/spawn/shared'
import { spawn, spawnSync } from '../../../src/process/spawn/child'

import { describeUnixOnly } from '../util/skip-helpers'

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'socket-spawn-trust-'))
  tempRoots.push(root)
  return readRealPath(root) ?? root
}

function writeEchoScript(
  dirPath: string,
  name: string,
  marker: string,
): string {
  mkdirSync(dirPath, { recursive: true })
  const filePath = path.join(dirPath, name)
  writeFileSync(filePath, `#!/bin/sh\necho ${marker}\n`, { mode: 0o755 })
  return filePath
}

beforeEach(() => {
  spawnBinPathCache.clear()
})

afterAll(async () => {
  await Promise.all(tempRoots.map(root => safeDelete(root)))
})

describe('hasCmdExeShadowInDir', () => {
  it('reports a same-named script in the directory', () => {
    const root = makeTempRoot()
    writeEchoScript(root, 'shadowed.cmd', 'attacker')
    expect(hasCmdExeShadowInDir('shadowed', root, '.COM;.EXE;.BAT;.CMD')).toBe(
      true,
    )
  })

  it('reports an extension-less match too', () => {
    const root = makeTempRoot()
    writeEchoScript(root, 'bare', 'attacker')
    expect(hasCmdExeShadowInDir('bare', root, '.EXE')).toBe(true)
  })

  it('reports nothing when the directory is clean', () => {
    const root = makeTempRoot()
    expect(hasCmdExeShadowInDir('absent', root, '.COM;.EXE;.BAT;.CMD')).toBe(
      false,
    )
  })

  it('reports nothing for a directory that does not exist', () => {
    expect(hasCmdExeShadowInDir('git', '/definitely/not/here', '.EXE')).toBe(
      false,
    )
  })
})

describe('applyCmdExeStem', () => {
  it('drops the PATH override for an already-absolute command', () => {
    const applied = applyCmdExeStem(
      { command: '/usr/bin/git', searchPath: '/usr/bin', trusted: true },
      {},
    )
    expect(applied.command).toBe('/usr/bin/git')
    expect(applied.searchPath).toBeUndefined()
  })

  it('keeps the PATH override for an unresolved bare command', () => {
    const applied = applyCmdExeStem(
      { command: 'git', searchPath: '/usr/bin', trusted: false },
      {},
    )
    expect(applied.command).toBe('git')
    expect(applied.searchPath).toBe('/usr/bin')
  })
})

describe('resolveSpawnBin — explicit paths', () => {
  it('passes an explicit path through untouched', () => {
    const resolution = resolveSpawnBin('/usr/bin/env', { cwd: process.cwd() })
    expect(resolution.command).toBe('/usr/bin/env')
    expect(resolution.searchPath).toBeUndefined()
  })
})

describeUnixOnly('resolveSpawnBin — PATH trust', () => {
  it('does not leak a resolution across two different working directories', () => {
    const rootA = makeTempRoot()
    const rootB = makeTempRoot()
    const binA = path.join(rootA, 'system-bin')
    const binB = path.join(rootB, 'system-bin')
    const toolA = writeEchoScript(binA, 'socket-cache-tool', 'from-a')
    const toolB = writeEchoScript(binB, 'socket-cache-tool', 'from-b')

    const first = resolveSpawnBin('socket-cache-tool', {
      cwd: path.join(rootA, 'repo'),
      env: { PATH: binA },
    })
    const second = resolveSpawnBin('socket-cache-tool', {
      cwd: path.join(rootB, 'repo'),
      env: { PATH: binB },
    })
    expect(first.command).toBe(toolA)
    expect(second.command).toBe(toolB)
  })

  it('does not leak a resolution across two different search paths', () => {
    const root = makeTempRoot()
    const binA = path.join(root, 'bin-a')
    const binB = path.join(root, 'bin-b')
    const toolA = writeEchoScript(binA, 'socket-path-tool', 'from-a')
    const toolB = writeEchoScript(binB, 'socket-path-tool', 'from-b')
    const cwd = path.join(root, 'repo')

    expect(
      resolveSpawnBin('socket-path-tool', { cwd, env: { PATH: binA } }).command,
    ).toBe(toolA)
    expect(
      resolveSpawnBin('socket-path-tool', { cwd, env: { PATH: binB } }).command,
    ).toBe(toolB)
  })

  it('reuses the cache for a repeated command, cwd, and PATH', () => {
    const root = makeTempRoot()
    const bin = path.join(root, 'system-bin')
    const tool = writeEchoScript(bin, 'socket-hit-tool', 'hit')
    const config = { cwd: path.join(root, 'repo'), env: { PATH: bin } }
    expect(resolveSpawnBin('socket-hit-tool', config).command).toBe(tool)
    expect(spawnBinPathCache.size).toBe(1)
    expect(resolveSpawnBin('socket-hit-tool', config).command).toBe(tool)
    expect(spawnBinPathCache.size).toBe(1)
  })

  it('prefers a trusted directory over one inside the working directory', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const systemBin = path.join(root, 'system-bin')
    writeEchoScript(repo, 'socket-shim-tool', 'attacker')
    const real = writeEchoScript(systemBin, 'socket-shim-tool', 'system')
    const resolution = resolveSpawnBin('socket-shim-tool', {
      cwd: repo,
      env: { PATH: [repo, systemBin].join(path.delimiter) },
    })
    expect(resolution.command).toBe(real)
    expect(resolution.trusted).toBe(true)
  })

  it('hands the child a sanitized PATH when nothing trusted supplies the command', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const repoBin = path.join(repo, 'bin')
    writeEchoScript(repoBin, 'socket-unresolvable-tool', 'attacker')
    const resolution = resolveSpawnBin('socket-unresolvable-tool', {
      cwd: repo,
      env: { PATH: repoBin },
    })
    expect(resolution.command).toBe('socket-unresolvable-tool')
    expect(resolution.searchPath).toBe('')
    expect(resolution.trusted).toBe(false)
  })

  it('still reaches a workspace node_modules/.bin', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const shadowBin = path.join(repo, 'node_modules', '.bin')
    const tool = writeEchoScript(shadowBin, 'socket-local-tool', 'local')
    const resolution = resolveSpawnBin('socket-local-tool', {
      cwd: repo,
      env: { PATH: shadowBin },
    })
    expect(resolution.command).toBe(tool)
    expect(resolution.trusted).toBe(false)
  })
})

describeUnixOnly('spawn with an untrusted working directory', () => {
  it('runs the trusted binary, not the working directory shim', async () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const systemBin = path.join(root, 'system-bin')
    writeEchoScript(repo, 'socket-e2e-tool', 'attacker')
    writeEchoScript(systemBin, 'socket-e2e-tool', 'system')
    const result = await spawn('socket-e2e-tool', [], {
      cwd: repo,
      env: { PATH: [repo, systemBin].join(path.delimiter) },
    })
    expect(result.stdout).toBe('system')
  })

  it('runs the trusted binary from spawnSync too', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const systemBin = path.join(root, 'system-bin')
    writeEchoScript(repo, 'socket-e2e-sync-tool', 'attacker')
    writeEchoScript(systemBin, 'socket-e2e-sync-tool', 'system')
    const result = spawnSync('socket-e2e-sync-tool', [], {
      cwd: repo,
      env: {
        PATH: [repo, systemBin].join(path.delimiter),
      } as NodeJS.ProcessEnv,
    })
    expect(result.stdout).toBe('system')
  })

  it('spawns an explicit path inside the working directory when asked', async () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const tool = writeEchoScript(repo, 'socket-explicit-tool', 'explicit')
    const result = await spawn(tool, [], { cwd: repo })
    expect(result.stdout).toBe('explicit')
  })
})
