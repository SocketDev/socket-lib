/**
 * @file Packed attestation verification with isolated process and filesystem
 *   state.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { whichRealSync } from '@socketsecurity/lib-stable/exe/path/which'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { extractTarGz } from '../../src/archives/tar.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

describe('packed Sigstore verifier', () => {
  it('verifies both evidence modes offline without installed packages and loads lazily', async () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'sigstore-packed-'))
    try {
      const config = path.join(temporary, 'empty-config')
      writeFileSync(config, '')
      const env = {
        PATH: process.env['PATH'],
        SYSTEMROOT: process.env['SYSTEMROOT'],
        HOME: temporary,
        USERPROFILE: temporary,
        TMPDIR: temporary,
        TEMP: temporary,
        TMP: temporary,
        XDG_CONFIG_HOME: temporary,
        XDG_CACHE_HOME: temporary,
        GIT_CONFIG_GLOBAL: config,
        GIT_CONFIG_NOSYSTEM: '1',
        npm_config_userconfig: config,
        npm_config_cache: path.join(temporary, 'npm-cache'),
      }
      const pnpmPath =
        process.env['npm_execpath'] ?? whichRealSync('pnpm', { path: env.PATH })
      if (typeof pnpmPath !== 'string') {
        throw new Error('pnpm is unavailable')
      }
      const packArgs = [
        'pack',
        '--ignore-scripts',
        '--pack-destination',
        temporary,
      ]
      const script = /\.(?:c|m)?js$/.test(pnpmPath)
      const packed = await spawn(
        script ? process.execPath : pnpmPath,
        script ? [pnpmPath, ...packArgs] : packArgs,
        {
          cwd: repoRoot,
          env,
          stdio: 'pipe',
        },
      )
      expect(packed.code).toBe(0)
      const archive = readdirSync(temporary).find(name =>
        name.endsWith('.tgz'),
      )!
      const extracted = path.join(temporary, 'extracted')
      mkdirSync(extracted)
      await extractTarGz(path.join(temporary, archive), extracted)
      const packagePath = path.join(extracted, 'package')
      const manifest = JSON.parse(
        readFileSync(path.join(packagePath, 'package.json'), 'utf8'),
      )
      expect(manifest.dependencies ?? {}).toEqual({})
      cpSync(
        new URL('../unit/attestations/fixtures', import.meta.url),
        path.join(temporary, 'fixtures'),
        { recursive: true },
      )
      const runner = path.join(temporary, 'verify-packed.cjs')
      cpSync(
        new URL('./fixture/attestations/verify-packed.cjs', import.meta.url),
        runner,
      )
      const verified = await spawn(
        process.execPath,
        [
          '--permission',
          '--allow-fs-read=*',
          runner,
          packagePath,
          path.join(temporary, 'fixtures'),
        ],
        { cwd: temporary, env, stdio: 'pipe' },
      )
      expect(verified.code).toBe(0)
      expect(JSON.parse(verified.stdout)).toEqual({
        verified: 2,
        lazy: true,
        network: false,
      })
    } finally {
      safeDeleteSync(temporary)
    }
  })
})
