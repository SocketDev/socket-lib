/**
 * @file Open a URL in the platform's default browser. This lives under
 *   process/, not url/ — url/ is strictly pure string operations and must stay
 *   IO-free, whereas opening a URL spawns the OS opener, so it is a process
 *   action. `pickOpenCommand` is a pure, exported mapping from platform to
 *   opener binary: darwin uses `open`, win32 uses `start`, everything else uses
 *   `xdg-open`. `openUrl` takes an injectable spawner so tests drive the launch
 *   path without opening a real browser, mirroring the ai/exec
 *   injectable-runner pattern; the default spawner shells out through
 *   node:child_process, detached with stdio ignored so the opener outlives this
 *   process and never blocks it.
 */

import process from 'node:process'

import { getNodeChildProcess } from '../node/child-process'

/**
 * Spawn options handed to an {@link OpenUrlSpawner}. `openUrl` computes these
 * from the platform so the spawner stays a thin pass-through to a child-process
 * spawn: detached and stdio-ignored so the opener outlives us, shell only on
 * win32 where `start` is a cmd.exe builtin rather than an executable.
 */
export interface OpenUrlSpawnOptions {
  readonly detached: boolean
  readonly shell: boolean
  readonly stdio: 'ignore'
}

/**
 * The injectable launch primitive: spawn `command` with `args` under
 * `options`. The lib ships {@link defaultOpenUrlSpawner}; a test injects a stub
 * to assert the command and URL without launching anything.
 */
export type OpenUrlSpawner = (
  command: string,
  args: readonly string[],
  options: OpenUrlSpawnOptions,
) => void

/**
 * Options for {@link openUrl}. `platform` is injectable so a test can exercise
 * every opener branch on one host; it defaults to `process.platform`. `spawn`
 * is the injectable launch seam; it defaults to {@link defaultOpenUrlSpawner}.
 */
export interface OpenUrlOptions {
  readonly platform?: NodeJS.Platform | undefined
  readonly spawn?: OpenUrlSpawner | undefined
}

/**
 * The built-in launch spawner: shell out to the opener through
 * node:child_process, detached with stdio ignored, then unref so the opener
 * outlives this process. Best-effort — a failed spawn is swallowed because the
 * caller can still relay the URL by hand.
 */
export function defaultOpenUrlSpawner(
  command: string,
  args: readonly string[],
  options: OpenUrlSpawnOptions,
): void {
  try {
    // Alias the raw node spawn so it is clearly the child-process primitive,
    // not the lib's enriched spawn wrapper — a fire-and-forget detached opener
    // needs the bare ChildProcess so it can be unref'd.
    const { spawn: nodeSpawn } = getNodeChildProcess()
    const child = nodeSpawn(command, [...args], options)
    child.on('error', () => {})
    child.unref()
  } catch {
    // Opening the browser is best-effort; the caller still has the URL.
  }
}

/**
 * Open `url` in the platform's default browser. Resolves the opener via
 * {@link pickOpenCommand}, then hands the launch to the injectable spawner so
 * tests never touch a real browser. Fire-and-forget: it returns immediately and
 * does not wait for the opener.
 */
export function openUrl(
  url: string,
  options?: OpenUrlOptions | undefined,
): void {
  const { platform = process.platform, spawn = defaultOpenUrlSpawner } = {
    __proto__: null,
    ...options,
  } as OpenUrlOptions
  const command = pickOpenCommand(platform)
  spawn(command, [url], {
    detached: true,
    // `start` is a cmd.exe builtin, not an executable, so win32 needs a shell.
    shell: platform === 'win32',
    stdio: 'ignore',
  })
}

/**
 * The platform command that opens a URL in the default browser: `open` on
 * darwin, `start` on win32, `xdg-open` everywhere else. Pure and exported so
 * the per-platform choice is unit-testable without spawning anything.
 */
export function pickOpenCommand(platform: NodeJS.Platform): string {
  if (platform === 'darwin') {
    return 'open'
  }
  if (platform === 'win32') {
    return 'start'
  }
  return 'xdg-open'
}
