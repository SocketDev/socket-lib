/**
 * @file Decide whether a spawn needs `shell: true` on Windows, in one place.
 *   Callers reach for `shell: isWin32()` because Windows package-manager
 *   binaries (`pnpm`, `npm`, `gh`) ship as `.cmd` shims, and node cannot exec a
 *   `.cmd` without a shell. That reasoning is correct for a shim and wrong for
 *   a real `.exe`: handing an executable to cmd.exe buys nothing and adds a
 *   quoting layer that has to escape every argument correctly.
 *   `shell: isWin32()` cannot tell the two apart because it only looks at the
 *   platform, never at the command.
 *   `needsWindowsShell` looks at the command. Off Windows it is always false,
 *   because every POSIX exec path handles a script through its shebang. On
 *   Windows a script extension or a bare stem needs the shell, and an explicit
 *   executable extension does not.
 *   `platform` is injectable so every branch is testable from one host, which
 *   is what makes this worth having as a helper rather than an inline ternary.
 */

import process from 'node:process'

import { getNodePath } from '../../node/path'

/**
 * Extensions cmd.exe has to interpret rather than exec. A command ending in one
 * of these needs `shell: true` on Windows.
 */
export const WINDOWS_SHELL_SCRIPT_EXTENSIONS: readonly string[] = [
  '.bat',
  '.cmd',
  '.ps1',
]

/**
 * Extensions Windows can exec directly. A command ending in one of these needs
 * NO shell, so it skips cmd.exe's quoting rules entirely.
 */
export const WINDOWS_DIRECT_EXEC_EXTENSIONS: readonly string[] = [
  '.com',
  '.exe',
]

/**
 * Options for {@link needsWindowsShell}. `platform` defaults to
 * `process.platform` and exists so a test can exercise the Windows branches
 * from any host.
 */
export interface NeedsWindowsShellOptions {
  readonly platform?: NodeJS.Platform | undefined
}

/**
 * Whether spawning `command` needs `shell: true`.
 *
 * False on every non-Windows platform. On Windows:
 * - a `.cmd` / `.bat` / `.ps1` script needs the shell, because cmd.exe
 * interprets it rather than exec'ing it;
 * - a `.exe` / `.com` does NOT, so it avoids cmd.exe quoting altogether;
 * - a bare stem (`pnpm`, `gh`) needs it, because PATHEXT resolution is what
 * finds the `.cmd` shim, and that resolution is the shell's job.
 *
 * An unrecognized extension is treated as a bare stem: the safe answer is the
 * shell, since that is the behavior `shell: isWin32()` already had.
 */
export function needsWindowsShell(
  command: string,
  options?: NeedsWindowsShellOptions | undefined,
): boolean {
  const { platform = process.platform } = {
    __proto__: null,
    ...options,
  } as NeedsWindowsShellOptions
  if (platform !== 'win32') {
    return false
  }
  const path = getNodePath()
  const ext = path.extname(command).toLowerCase()
  if (ext === '') {
    return true
  }
  if (WINDOWS_DIRECT_EXEC_EXTENSIONS.includes(ext)) {
    return false
  }
  return true
}

/**
 * The `shell` value to pass to a spawn of `command`, ready to spread into spawn
 * options. Sugar over {@link needsWindowsShell} for the common call shape:
 *
 * ```typescript
 * await spawn(binCommand, args, {
 *   ...windowsShellOption(binCommand),
 *   ...options,
 * })
 * ```
 */
export function windowsShellOption(
  command: string,
  options?: NeedsWindowsShellOptions | undefined,
): { shell: boolean } {
  return { shell: needsWindowsShell(command, options) }
}
