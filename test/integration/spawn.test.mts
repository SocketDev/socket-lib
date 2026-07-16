/**
 * @file Integration tests for spawn process utilities. Tests real process
 *   spawning with actual commands:
 *
 *   - spawn() executes commands and captures output
 *   - spawnSync() executes commands synchronously
 *   - Process exit codes, stdout, stderr handling
 *   - Environment variable passing
 *   - Working directory changes Used by Socket CLI for running npm, git, and
 *     other external commands.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { spawn, spawnSync } from '@socketsecurity/lib/process/spawn/child'
import { describe, expect, it } from 'vitest'

import { WIN32 } from '../_shared/fleet/lib/platform.mts'
import { itWindowsOnly } from '../unit/util/skip-helpers'

describe('spawn integration', () => {
  describe('spawn', () => {
    itWindowsOnly(
      'executes a PATH-resolved .cmd shim through cmd.exe',
      async () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), 'spawn-cmd-'))
        const command = 'socket-lib-spawn-fixture'
        try {
          writeFileSync(
            path.join(dir, `${command}.cmd`),
            '@echo off\r\necho %1\r\n',
          )
          const result = await spawn(command, ['works'], {
            env: {
              ...process.env,
              PATH: `${dir}${path.delimiter}${process.env['PATH'] ?? ''}`,
            },
            shell: WIN32,
          })
          expect(result.stdout.trim()).toBe('works')
        } finally {
          rmSync(dir, { force: true, recursive: true })
        }
      },
    )

    it('should execute echo command and capture output', async () => {
      const result = await spawn('echo', ['hello world'])
      expect(result.code).toBe(0)
      expect(result.stdout.toString().trim()).toBe('hello world')
      expect(result.stderr.toString()).toBe('')
    })

    it('should execute node command and capture output', async () => {
      const result = await spawn('node', ['--version'])
      expect(result.code).toBe(0)
      expect(result.stdout.toString()).toMatch(/^v\d+\.\d+\.\d+/)
      expect(result.stderr.toString()).toBe('')
    })

    it('should handle command failure with non-zero exit code', async () => {
      // spawn throws on non-zero exit by default
      try {
        await spawn('node', ['--invalid-flag'])
        expect.fail('Should have thrown')
      } catch (error: unknown) {
        const err = error as {
          code?: number | undefined
          message?: string | undefined
        }
        expect(err.message).toContain('Command failed')
        expect(err.message).toContain('exit code')
        expect(err.code).toBe(9)
      }
    })

    it('should pass environment variables to spawned process', async () => {
      const result = await spawn('node', ['-p', 'process.env.TEST_VAR'], {
        env: {
          ...process.env,
          TEST_VAR: 'test-value',
        },
      })
      expect(result.code).toBe(0)
      expect(result.stdout.toString().trim()).toBe('test-value')
    })

    it('should execute command in specified working directory', async () => {
      const result = await spawn('pwd', [], {
        cwd: '/tmp',
      })
      expect(result.code).toBe(0)
      // macOS uses /private/tmp symlink, Windows Git Bash uses /d/tmp or similar
      expect(result.stdout.toString().trim()).toMatch(
        /^(?:\/[a-z]\/tmp|\/private\/tmp|\/tmp)$/,
      )
    })

    it('should handle command not found error', async () => {
      try {
        await spawn('nonexistent-command-xyz', [])
      } catch (e) {
        expect(e).toBeDefined()
      }
    })
  })

  describe('spawnSync', () => {
    itWindowsOnly('executes a PATH-resolved .cmd shim through cmd.exe', () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'spawn-sync-cmd-'))
      const command = 'socket-lib-spawn-sync-fixture'
      try {
        writeFileSync(
          path.join(dir, `${command}.cmd`),
          '@echo off\r\necho %1\r\n',
        )
        const result = spawnSync(command, ['works'], {
          env: {
            ...process.env,
            PATH: `${dir}${path.delimiter}${process.env['PATH'] ?? ''}`,
          },
          shell: WIN32,
        })
        expect(result.stdout.trim()).toBe('works')
      } finally {
        rmSync(dir, { force: true, recursive: true })
      }
    })

    it('should execute echo command synchronously', () => {
      const result = spawnSync('echo', ['hello sync'])
      expect(result.status).toBe(0)
      expect(result.stdout.toString().trim()).toBe('hello sync')
      expect(result.stderr.toString()).toBe('')
    })

    it('should execute node command synchronously', () => {
      const result = spawnSync('node', ['--version'])
      expect(result.status).toBe(0)
      expect(result.stdout.toString()).toMatch(/^v\d+\.\d+\.\d+/)
    })

    it('should handle sync command failure', () => {
      const result = spawnSync('node', ['--invalid-flag'])
      expect(result.status).not.toBe(0)
      expect(result.stderr.toString()).toContain('invalid')
    })

    it('should pass environment to sync spawned process', () => {
      const result = spawnSync('node', ['-p', 'process.env.SYNC_VAR'], {
        env: {
          ...process.env,
          SYNC_VAR: 'sync-value',
        },
      })
      expect(result.status).toBe(0)
      expect(result.stdout.toString().trim()).toBe('sync-value')
    })
  })
})
