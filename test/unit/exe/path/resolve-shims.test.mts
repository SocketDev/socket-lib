import { describe, expect, it } from 'vitest'

import { isKnownShimExtension } from '../../../../src/exe/path/bin-kinds.mjs'
import { windowsShimRelPath } from '../../../../src/exe/path/resolve-shims.mjs'

describe('Windows shim target parsing on every platform', () => {
  it.each([
    [
      'npm',
      '.cmd',
      'set "NPM_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npm-cli.js"',
      'node_modules\\npm\\bin\\npm-cli.js',
    ],
    [
      'npx',
      '.cmd',
      'set "NPX_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npx-cli.js"',
      'node_modules\\npm\\bin\\npx-cli.js',
    ],
    [
      'npm',
      '',
      'NPM_CLI_JS="$CLI_BASEDIR/node_modules/npm/bin/npm-cli.js"',
      'node_modules/npm/bin/npm-cli.js',
    ],
    [
      'npx',
      '',
      'NPX_CLI_JS="$CLI_BASEDIR/node_modules/npm/bin/npx-cli.js"',
      'node_modules/npm/bin/npx-cli.js',
    ],
    [
      'npm',
      '.ps1',
      '$NPM_CLI_JS="$PSScriptRoot/node_modules/npm/bin/npm-cli.js"',
      'node_modules/npm/bin/npm-cli.js',
    ],
    [
      'npx',
      '.ps1',
      '$NPX_CLI_JS="$PSScriptRoot/node_modules/npm/bin/npx-cli.js"',
      'node_modules/npm/bin/npx-cli.js',
    ],
    [
      'pnpm',
      '.cmd',
      'node "%~dp0\\pnpm\\bin\\pnpm.cjs" %*',
      'pnpm\\bin\\pnpm.cjs',
    ],
    [
      'yarn',
      '.cmd',
      '"%~dp0\\node.exe" "%~dp0\\yarn\\bin\\yarn.js" %*',
      'yarn\\bin\\yarn.js',
    ],
    [
      'pnpm',
      '.cmd',
      '"%dp0%\\pnpm\\bin\\pnpm.cjs" %*\r\n',
      'pnpm\\bin\\pnpm.cjs',
    ],
    [
      'pnpm',
      '',
      'exec node "$basedir/.tools/pnpm/10.0.0/bin/pnpm.cjs" "$@"\n',
      '.tools/pnpm/10.0.0/bin/pnpm.cjs',
    ],
    [
      'yarn',
      '',
      '"$basedir/node" "$basedir/yarn/bin/yarn.js" "$@"\n',
      'yarn/bin/yarn.js',
    ],
    [
      'pnpm',
      '.ps1',
      '& "$basedir/node$exe" "$basedir/pnpm/bin/pnpm.cjs" $args\n',
      'pnpm/bin/pnpm.cjs',
    ],
    [
      'example-cli',
      '',
      '"$basedir/node" "$basedir/example-cli/bin.js" "$@"\n',
      'example-cli/bin.js',
    ],
    [
      'example-cli',
      '.ps1',
      '& "$basedir/node$exe" "$basedir/example-cli/bin.js" $args\n',
      'example-cli/bin.js',
    ],
    [
      'example-cli',
      '.cmd',
      '"%dp0%\\example-cli\\bin.js" %*\r\n',
      'example-cli\\bin.js',
    ],
  ])(
    'extracts the target for %s %s',
    (basename, extLowered, source, expected) => {
      expect(windowsShimRelPath({ basename, extLowered, source })).toBe(
        expected,
      )
    },
  )

  it.each(['\n', '\r\n'])('accepts generated shim line endings %j', newline => {
    for (const basename of ['pnpm', 'example-cli']) {
      expect(
        windowsShimRelPath({
          basename,
          extLowered: '.ps1',
          source: `& "$basedir/node$exe" "$basedir/example/bin.js" $args${newline}`,
        }),
      ).toBe('example/bin.js')
      expect(
        windowsShimRelPath({
          basename,
          extLowered: '',
          source: `"$basedir/node" "$basedir/example/bin.js" "$@"${newline}`,
        }),
      ).toBe('example/bin.js')
      expect(
        windowsShimRelPath({
          basename,
          extLowered: '.cmd',
          source: `"%dp0%\\node.exe" "%dp0%\\example\\bin.js" %*${newline}`,
        }),
      ).toBe('example\\bin.js')
    }
  })

  it.each(['npm', 'pnpm', 'example-cli'])(
    'rejects unsupported or unrelated %s wrappers',
    basename => {
      for (const extLowered of ['.exe', '.cmd', '.ps1', '']) {
        expect(
          windowsShimRelPath({
            basename,
            extLowered,
            source: 'echo unrelated',
          }),
        ).toBe('')
      }
    },
  )

  it.each(['', '.cmd', '.exe', '.ps1'])(
    'recognizes supported extension %s',
    extension => {
      expect(isKnownShimExtension(extension)).toBe(true)
    },
  )

  it.each(['.js', '.bat', '.CMD'])(
    'rejects unknown or unnormalized extension %s',
    extension => {
      expect(isKnownShimExtension(extension)).toBe(false)
    },
  )
})
