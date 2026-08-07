/**
 * @file Specs for the Windows spawn-shell decision. The property that matters
 *   is that the answer depends on the COMMAND and not only on the platform:
 *   `shell: isWin32()` cannot tell a `.cmd` shim from a real `.exe`, and
 *   handing an executable to cmd.exe adds a quoting layer for nothing.
 *   `platform` is injected so every Windows branch runs from any host.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  needsWindowsShell,
  WINDOWS_DIRECT_EXEC_EXTENSIONS,
  WINDOWS_SHELL_SCRIPT_EXTENSIONS,
  windowsShellOption,
} from '../../../src/process/spawn/windows-shell'

const WIN = { platform: 'win32' as NodeJS.Platform }

describe('needsWindowsShell', () => {
  test('never asks for a shell off Windows', () => {
    for (const platform of ['darwin', 'linux', 'freebsd'] as const) {
      // A POSIX exec runs a script through its shebang, so nothing needs cmd.exe.
      assert.equal(needsWindowsShell('pnpm', { platform }), false)
      assert.equal(
        needsWindowsShell('C:\\tools\\pnpm.cmd', { platform }),
        false,
      )
    }
  })

  test('a script extension needs the shell', () => {
    for (const ext of WINDOWS_SHELL_SCRIPT_EXTENSIONS) {
      assert.equal(needsWindowsShell(`C:\\tools\\pnpm${ext}`, WIN), true, ext)
    }
  })

  test('an executable does NOT need the shell', () => {
    // This is the case blanket `shell: isWin32()` gets wrong: cmd.exe buys nothing
    // here and every argument then has to survive its quoting rules.
    for (const ext of WINDOWS_DIRECT_EXEC_EXTENSIONS) {
      assert.equal(needsWindowsShell(`C:\\tools\\node${ext}`, WIN), false, ext)
    }
  })

  test('extension matching ignores case, because Windows does', () => {
    assert.equal(needsWindowsShell('C:\\tools\\PNPM.CMD', WIN), true)
    assert.equal(needsWindowsShell('C:\\tools\\NODE.EXE', WIN), false)
  })

  test('a bare stem needs the shell, because PATHEXT resolution finds the shim', () => {
    assert.equal(needsWindowsShell('pnpm', WIN), true)
    assert.equal(needsWindowsShell('gh', WIN), true)
  })

  test('an unrecognized extension keeps the old blanket answer', () => {
    // Safer to keep asking for the shell than to silently change behavior for a
    // command shape this does not model.
    assert.equal(needsWindowsShell('C:\\tools\\thing.weird', WIN), true)
  })

  test('a dotfile-looking command is a stem, not an extension', () => {
    // path.extname('.npmrc') is '' , so this lands on the stem branch.
    assert.equal(needsWindowsShell('.npmrc', WIN), true)
  })
})

describe('windowsShellOption', () => {
  test('is spreadable into spawn options', () => {
    // prefer-shell-win32: intentional — this is the EXPECTED VALUE of the
    // helper that computes the shell decision, not a spawn call choosing one.
    assert.deepEqual(windowsShellOption('pnpm', WIN), { shell: true })
    assert.deepEqual(windowsShellOption('C:\\tools\\node.exe', WIN), {
      shell: false,
    })
    assert.deepEqual(windowsShellOption('pnpm', { platform: 'linux' }), {
      shell: false,
    })
  })
})
