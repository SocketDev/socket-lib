import { realpathSync } from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  npmWindowsQuickCliPath,
  repairMalformedPnpmBinPath,
  resolvePosixWrapperPath,
  resolveWindowsWrapperPath,
} from '../../../../src/exe/path/resolve.mjs'
import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'
import { runWithTempDir } from '../../util/temp-files.mjs'

describe('portable Windows wrapper resolution', () => {
  it.each(['npm', 'npx'])(
    'finds the installed %s CLI without reading a wrapper',
    async basename => {
      await runWithTempDir(async root => {
        const binPath = path.join(root, `${basename}.cmd`)
        const cliPath = path.join(
          root,
          'node_modules/npm/bin',
          `${basename}-cli.js`,
        )
        await fsPromises.mkdir(path.dirname(cliPath), { recursive: true })
        await fsPromises.writeFile(cliPath, 'export {}')
        expect(
          npmWindowsQuickCliPath({ basename, binPath, extLowered: '.cmd' }),
        ).toBe(realpathSync.native(cliPath))
      }, 'quick-cli-')
    },
  )

  it('keeps an existing CLI path when realpath fails', async () => {
    await runWithTempDir(async root => {
      const cliPath = path.join(root, 'node_modules/npm/bin/npm-cli.js')
      await fsPromises.mkdir(path.dirname(cliPath), { recursive: true })
      await fsPromises.writeFile(cliPath, 'export {}')
      const realpath = vi
        .spyOn(realpathSync, 'native')
        .mockImplementation(() => {
          throw Object.assign(new Error('fixture realpath failure'), {
            code: 'EACCES',
          })
        })
      try {
        expect(
          npmWindowsQuickCliPath({
            basename: 'npm',
            binPath: path.join(root, 'npm.cmd'),
            extLowered: '.cmd',
          }),
        ).toBe(cliPath)
      } finally {
        realpath.mockRestore()
      }
    }, 'quick-cli-fallback-')
  })

  it.each([
    ['npm', '.js'],
    ['example-cli', '.cmd'],
    ['npm', '.cmd'],
  ])(
    'rejects unavailable quick layouts for %s %s',
    async (basename, extLowered) => {
      await runWithTempDir(async root => {
        expect(
          npmWindowsQuickCliPath({
            basename,
            binPath: path.join(root, `${basename}${extLowered}`),
            extLowered,
          }),
        ).toBe('')
      }, 'missing-quick-cli-')
    },
  )

  it.each([
    [
      'npm',
      '.cmd',
      'set "NPM_CLI_JS=%~dp0\\lib\\npm-cli.js"',
      'lib/npm-cli.js',
    ],
    [
      'example-cli',
      '.ps1',
      '& "$basedir/node$exe" "$basedir/lib/cli.js" $args\n',
      'lib/cli.js',
    ],
    [
      'pnpm',
      '',
      'exec node "$basedir/../lib/pnpm.cjs" "$@"\n',
      '../lib/pnpm.cjs',
    ],
  ])(
    'resolves %s %s wrapper targets',
    async (basename, extLowered, source, relative) => {
      await runWithTempDir(async root => {
        const binPath = path.join(root, `${basename}${extLowered}`)
        await fsPromises.writeFile(binPath, source)
        expect(
          resolveWindowsWrapperPath({ basename, binPath, extLowered }),
        ).toBe(normalizePath(path.resolve(root, relative)))
      }, 'windows-wrapper-')
    },
  )

  it.each(['.js', '.exe', '.cmd'])(
    'preserves missing %s files without reading them',
    async extLowered => {
      await runWithTempDir(async root => {
        const binPath = path.join(root, `example-cli${extLowered}`)
        expect(
          resolveWindowsWrapperPath({
            basename: 'example-cli',
            binPath,
            extLowered,
          }),
        ).toBe(binPath)
      }, 'missing-wrapper-')
    },
  )

  it('preserves an unrelated command body', async () => {
    await runWithTempDir(async root => {
      const binPath = path.join(root, 'example-cli.cmd')
      await fsPromises.writeFile(binPath, '@echo unrelated\n')
      expect(
        resolveWindowsWrapperPath({
          basename: 'example-cli',
          binPath,
          extLowered: '.cmd',
        }),
      ).toBe(binPath)
    }, 'unrelated-wrapper-')
  })
})

describe('malformed pnpm wrapper repair', () => {
  it('repairs a nested path and unwraps the recovered shell script', async () => {
    await runWithTempDir(async root => {
      const binPath = path.join(root, '.bin/pnpm')
      await fsPromises.mkdir(path.dirname(binPath), { recursive: true })
      await fsPromises.writeFile(
        binPath,
        'exec node "$basedir/../lib/pnpm.cjs" "$@"\n',
      )
      const malformed = `${normalizePath(binPath)}/bin/pnpm.cjs`
      expect(repairMalformedPnpmBinPath(malformed)).toBe(normalizePath(binPath))
      expect(
        resolvePosixWrapperPath({
          basename: 'pnpm',
          binPath: malformed,
          extLowered: '.cjs',
        }),
      ).toBe(normalizePath(path.join(root, 'lib/pnpm.cjs')))
    }, 'pnpm-repair-')
  })

  it.each(['missing', 'directory'])(
    'preserves malformed paths when the prefix is %s',
    async kind => {
      await runWithTempDir(async root => {
        const binPath = path.join(root, '.bin/pnpm')
        if (kind === 'directory') {
          await fsPromises.mkdir(binPath, { recursive: true })
        }
        const malformed = `${normalizePath(binPath)}/bin/pnpm.cjs`
        expect(repairMalformedPnpmBinPath(malformed)).toBe(malformed)
      }, 'pnpm-repair-invalid-')
    },
  )
})
