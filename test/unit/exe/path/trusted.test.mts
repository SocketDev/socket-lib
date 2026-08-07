/**
 * @file Unit tests for src/exe/trusted — resolveTrustedExecutable and its
 *   helpers. Fixtures are real directories under os.tmpdir() holding real
 *   mode-0o755 files, because the whole point of the resolver is what the
 *   filesystem says, not what a mock says.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterAll, describe, expect, it } from 'vitest'

import {
  findOutermostGitRoot,
  findPathEnvKey,
  foldPathForCompare,
  isPathWithinRoot,
  isTrustedTarget,
  readRealPath,
  replacePathInEnv,
  resolveTrustedExecutable,
  resolveUntrustedRoot,
  stripSurroundingQuotes,
} from '../../../../src/exe/path/trusted'
import { safeDelete } from '../../../../src/fs/safe'

import { describeUnixOnly } from '../../util/skip-helpers'

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'socket-trusted-'))
  tempRoots.push(root)
  // Compare against the realpath: macOS resolves /var to /private/var, and the
  // resolver's containment checks run on realpaths.
  return readRealPath(root) ?? root
}

function writeExecutable(dirPath: string, name: string): string {
  mkdirSync(dirPath, { recursive: true })
  const filePath = path.join(dirPath, name)
  writeFileSync(filePath, '#!/bin/sh\necho shim\n', { mode: 0o755 })
  return filePath
}

function envWithPath(entries: readonly string[]): NodeJS.ProcessEnv {
  return { PATH: entries.join(path.delimiter) }
}

afterAll(async () => {
  await Promise.all(tempRoots.map(root => safeDelete(root)))
})

describe('findPathEnvKey', () => {
  it('prefers an exact PATH key', () => {
    expect(findPathEnvKey({ PATH: '/usr/bin', Path: 'C:\\Windows' })).toBe(
      'PATH',
    )
  })

  it('finds a Windows-cased Path key', () => {
    expect(findPathEnvKey({ Path: 'C:\\Windows' })).toBe('Path')
  })

  it('returns undefined when no key is present', () => {
    expect(findPathEnvKey({ HOME: '/home/user' })).toBeUndefined()
  })
})

describe('foldPathForCompare', () => {
  it('drops a trailing separator', () => {
    expect(foldPathForCompare('/usr/bin/')).toBe('/usr/bin')
  })

  it('keeps a lone root separator', () => {
    expect(foldPathForCompare('/')).toBe('/')
  })
})

describe('isPathWithinRoot', () => {
  it('treats the root itself as within', () => {
    expect(isPathWithinRoot('/repo', '/repo')).toBe(true)
  })

  it('matches a descendant', () => {
    expect(isPathWithinRoot('/repo/bin/git', '/repo')).toBe(true)
  })

  it('does not match a sibling with a shared prefix', () => {
    expect(isPathWithinRoot('/repo-other/bin/git', '/repo')).toBe(false)
  })
})

describe('stripSurroundingQuotes', () => {
  it('removes surrounding double quotes', () => {
    expect(stripSurroundingQuotes('"/usr/local/bin"')).toBe('/usr/local/bin')
  })

  it('leaves an unquoted entry alone', () => {
    expect(stripSurroundingQuotes('/usr/local/bin')).toBe('/usr/local/bin')
  })
})

describe('readRealPath', () => {
  it('returns undefined for a path that does not resolve', () => {
    expect(readRealPath('/definitely/not/here/socket-lib')).toBeUndefined()
  })
})

describe('resolveUntrustedRoot', () => {
  it('returns undefined for a filesystem root', () => {
    expect(resolveUntrustedRoot(path.parse(process.cwd()).root)).toBeUndefined()
  })

  it('returns undefined for a directory that does not exist', () => {
    expect(resolveUntrustedRoot('/definitely/not/here')).toBeUndefined()
  })

  it('widens to the outermost git marker when asked', () => {
    const root = makeTempRoot()
    const outer = path.join(root, 'outer')
    const inner = path.join(outer, 'packages', 'inner')
    mkdirSync(path.join(outer, '.git'), { recursive: true })
    mkdirSync(path.join(inner, '.git'), { recursive: true })
    expect(resolveUntrustedRoot(inner)).toBe(inner)
    expect(resolveUntrustedRoot(inner, { useOutermostGitRoot: true })).toBe(
      outer,
    )
  })
})

describe('findOutermostGitRoot', () => {
  it('returns the input when no ancestor has a git marker', () => {
    const root = makeTempRoot()
    expect(findOutermostGitRoot(root)).toBe(root)
  })
})

describe('isTrustedTarget', () => {
  it('trusts everything when there is no untrusted root', () => {
    expect(isTrustedTarget('/anything', undefined)).toBe(true)
  })
})

describe('replacePathInEnv', () => {
  it('replaces every case variant of the key', () => {
    const next = replacePathInEnv(
      { HOME: '/home/user', Path: 'C:\\a', path: 'C:\\b' },
      'C:\\trusted',
      'Path',
    )
    expect(next['Path']).toBe('C:\\trusted')
    expect(next['path']).toBeUndefined()
    expect(next['HOME']).toBe('/home/user')
  })

  it('defaults to PATH when the env had no key', () => {
    expect(replacePathInEnv({}, '/usr/bin', undefined)['PATH']).toBe('/usr/bin')
  })
})

describeUnixOnly('resolveTrustedExecutable', () => {
  it('never resolves a shim inside the untrusted root', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const systemBin = path.join(root, 'system-bin')
    writeExecutable(repo, 'socket-fixture-tool')
    writeExecutable(systemBin, 'socket-fixture-tool')
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      // The repo entry is FIRST, so only the trust filter can keep it from
      // winning.
      env: envWithPath([repo, systemBin]),
      untrustedRoot: repo,
    })
    expect(resolved.binPath).toBe(path.join(systemBin, 'socket-fixture-tool'))
    expect(resolved.trusted).toBe(true)
    expect(resolved.searchPath).toBe(systemBin)
    expect(resolved.unsafeEntries).toContain(repo)
  })

  it('never resolves a shim in node_modules/.bin', () => {
    const root = makeTempRoot()
    const shadowBin = path.join(root, 'workspace', 'node_modules', '.bin')
    const systemBin = path.join(root, 'system-bin')
    writeExecutable(shadowBin, 'socket-fixture-tool')
    writeExecutable(systemBin, 'socket-fixture-tool')
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      env: envWithPath([shadowBin, systemBin]),
      // The shadow bin sits OUTSIDE the untrusted root, so only the shadow-bin
      // filter can exclude it.
      untrustedRoot: path.join(root, 'elsewhere-that-does-not-exist'),
    })
    expect(resolved.binPath).toBe(path.join(systemBin, 'socket-fixture-tool'))
    expect(resolved.unsafeEntries).toContain(shadowBin)
  })

  it('resolves a legitimate binary from a trusted entry', () => {
    const root = makeTempRoot()
    const systemBin = path.join(root, 'system-bin')
    const expected = writeExecutable(systemBin, 'socket-fixture-tool')
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      env: envWithPath([systemBin]),
      untrustedRoot: path.join(root, 'repo'),
    })
    expect(resolved.binPath).toBe(expected)
    expect(resolved.trusted).toBe(true)
  })

  it('still finds a real system binary with the ambient environment', () => {
    const resolved = resolveTrustedExecutable('node')
    expect(resolved.binPath).toBeDefined()
    expect(resolved.trusted).toBe(true)
  })

  it('rejects a symlink from a trusted entry into the untrusted root and poisons that entry', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const trustedBin = path.join(root, 'trusted-bin')
    const fallbackBin = path.join(root, 'fallback-bin')
    const evil = writeExecutable(repo, 'evil-payload')
    mkdirSync(trustedBin, { recursive: true })
    symlinkSync(evil, path.join(trustedBin, 'socket-fixture-tool'))
    const expected = writeExecutable(fallbackBin, 'socket-fixture-tool')
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      env: envWithPath([trustedBin, fallbackBin]),
      untrustedRoot: repo,
    })
    expect(resolved.binPath).toBe(expected)
    expect(resolved.unsafeEntries).toContain(trustedBin)
    expect(resolved.searchPath).toBe(fallbackBin)
  })

  it('drops empty, dot, and relative PATH entries', () => {
    const root = makeTempRoot()
    const systemBin = path.join(root, 'system-bin')
    writeExecutable(systemBin, 'socket-fixture-tool')
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      env: envWithPath(['', '.', 'relative/bin', systemBin]),
      untrustedRoot: path.join(root, 'repo'),
    })
    expect(resolved.searchPath).toBe(systemBin)
    expect(resolved.unsafeEntries).toEqual(['', '.', 'relative/bin'])
  })

  it('returns no binPath when only untrusted entries supply the command', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    writeExecutable(repo, 'socket-fixture-tool')
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      env: envWithPath([repo]),
      untrustedRoot: repo,
    })
    expect(resolved.binPath).toBeUndefined()
    expect(resolved.trusted).toBe(false)
    expect(resolved.searchPath).toBe('')
  })

  it("falls back to any dropped entry under untrustedFallback: 'all'", () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const expected = writeExecutable(repo, 'socket-fixture-tool')
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      env: envWithPath([repo]),
      untrustedFallback: 'all',
      untrustedRoot: repo,
    })
    expect(resolved.binPath).toBe(expected)
    expect(resolved.trusted).toBe(false)
    // The sanitized PATH still excludes the entry the fallback came from.
    expect(resolved.searchPath).toBe('')
  })

  it("falls back to node_modules/.bin but not a plain repo dir under untrustedFallback: 'shadowBins'", () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const repoBin = path.join(repo, 'bin')
    const shadowBin = path.join(repo, 'node_modules', '.bin')
    writeExecutable(repoBin, 'repo-only-tool')
    const localTool = writeExecutable(shadowBin, 'workspace-only-tool')
    const shared = { env: envWithPath([repoBin, shadowBin]) } as const
    expect(
      resolveTrustedExecutable('workspace-only-tool', {
        ...shared,
        untrustedFallback: 'shadowBins',
        untrustedRoot: repo,
      }).binPath,
    ).toBe(localTool)
    expect(
      resolveTrustedExecutable('repo-only-tool', {
        ...shared,
        untrustedFallback: 'shadowBins',
        untrustedRoot: repo,
      }).binPath,
    ).toBeUndefined()
  })

  it('never falls back to a poisoned trusted entry', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const trustedBin = path.join(root, 'trusted-bin')
    const evil = writeExecutable(repo, 'evil-payload')
    mkdirSync(trustedBin, { recursive: true })
    symlinkSync(evil, path.join(trustedBin, 'socket-fixture-tool'))
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      env: envWithPath([trustedBin]),
      untrustedFallback: 'all',
      untrustedRoot: repo,
    })
    expect(resolved.binPath).toBeUndefined()
  })

  it('passes an explicit absolute path through', () => {
    const root = makeTempRoot()
    const target = writeExecutable(path.join(root, 'anywhere'), 'tool')
    const resolved = resolveTrustedExecutable(target, {
      env: envWithPath([]),
      untrustedRoot: path.join(root, 'repo'),
    })
    expect(resolved.binPath).toBe(target)
    expect(resolved.trusted).toBe(true)
  })

  it('marks an explicit path inside the untrusted root as untrusted', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const target = writeExecutable(repo, 'tool')
    const resolved = resolveTrustedExecutable(target, {
      env: envWithPath([]),
      untrustedRoot: repo,
    })
    expect(resolved.binPath).toBe(target)
    expect(resolved.trusted).toBe(false)
  })

  it('resolves an explicit relative path against the process cwd', () => {
    const resolved = resolveTrustedExecutable('./package.json', {
      env: envWithPath([]),
    })
    expect(resolved.binPath).toBe(path.join(process.cwd(), 'package.json'))
  })

  it('sanitizes the returned environment', () => {
    const root = makeTempRoot()
    const repo = path.join(root, 'repo')
    const systemBin = path.join(root, 'system-bin')
    writeExecutable(repo, 'socket-fixture-tool')
    writeExecutable(systemBin, 'socket-fixture-tool')
    const resolved = resolveTrustedExecutable('socket-fixture-tool', {
      env: { HOME: '/home/user', PATH: [repo, systemBin].join(path.delimiter) },
      untrustedRoot: repo,
    })
    expect(resolved.env['PATH']).toBe(systemBin)
    expect(resolved.env['HOME']).toBe('/home/user')
    expect(existsSync(path.join(repo, 'socket-fixture-tool'))).toBe(true)
  })
})
