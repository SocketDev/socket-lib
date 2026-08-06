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
 *   `newWindow` opts into a NEW WINDOW instead of a tab. No platform opener can
 *   ask for one, so that lane invokes a browser binary with `--new-window`
 *   directly and falls back to the platform opener when no known browser is
 *   present. It is opt-in, so every existing caller keeps the behavior it has.
 */

import process from 'node:process'

import { getNodeChildProcess } from '../node/child-process'
import { getNodeFs } from '../node/fs'

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
 * Browser binaries that accept `--new-window`, in the order to try them.
 *
 * The platform opener cannot ask for a window: `open`, `xdg-open`, and `start`
 * have no such switch, so a URL handed to them lands as a TAB in whatever
 * window happens to be frontmost. The flag belongs to the BROWSER, and a
 * running instance answers it through its own process singleton, so invoking
 * the binary directly opens a new window in the session the user is already
 * signed into.
 */
export const NEW_WINDOW_BROWSERS: Readonly<Record<string, readonly string[]>> =
  {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Firefox.app/Contents/MacOS/firefox',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/firefox',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  }

/**
 * Points at a `--new-window` capable browser this table does not know about,
 * so an unusual install is not stuck with a tab.
 */
export const BROWSER_BINARY_ENV_VAR = 'SOCKET_BROWSER_BINARY'

/**
 * The command and args that open `url`. Pure, so the choice between a browser
 * binary and the platform opener is testable without spawning anything.
 */
export function buildOpenUrlInvocation(
  url: string,
  options?: OpenUrlOptions | undefined,
): { args: string[]; command: string; newWindow: boolean } {
  const { newWindow = false, platform = process.platform } = {
    __proto__: null,
    ...options,
  } as OpenUrlOptions
  const browser = newWindow ? resolveNewWindowBrowser(options) : undefined
  if (browser) {
    return { args: ['--new-window', url], command: browser, newWindow: true }
  }
  // No known browser, or no new window asked for: the platform opener still
  // opens the URL, so an unrecognized machine degrades to a tab rather than to
  // nothing at all.
  return { args: [url], command: pickOpenCommand(platform), newWindow: false }
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
  const invocation = buildOpenUrlInvocation(url, options)
  spawn(invocation.command, invocation.args, {
    detached: true,
    // `start` is a cmd.exe builtin, not an executable, so win32 needs a shell.
    // A browser binary is spawned directly and needs none, which also keeps
    // the URL clear of cmd.exe's quoting rules.
    shell: !invocation.newWindow && platform === 'win32',
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

/**
 * Options for {@link openUrl}. `platform` is injectable so a test can exercise
 * every opener branch on one host; it defaults to `process.platform`. `spawn`
 * is the injectable launch seam; it defaults to {@link defaultOpenUrlSpawner}.
 *
 * `newWindow` opts into a NEW WINDOW rather than a tab, which needs a browser
 * binary rather than the platform opener. It is opt-in so every existing caller
 * keeps the behavior it already has. `env` and `exists` back the browser
 * lookup and are injectable for the same reason `platform` is.
 */
export interface OpenUrlOptions {
  readonly env?: Record<string, string | undefined> | undefined
  readonly exists?: ((filePath: string) => boolean) | undefined
  readonly newWindow?: boolean | undefined
  readonly platform?: NodeJS.Platform | undefined
  readonly spawn?: OpenUrlSpawner | undefined
}

/**
 * The first `--new-window` capable browser present, or undefined when none is.
 * The env override wins outright, and an override naming a path that does not
 * exist resolves to nothing rather than quietly falling back to a different
 * browser than the one asked for.
 */
export function resolveNewWindowBrowser(
  options?: OpenUrlOptions | undefined,
): string | undefined {
  const fs = getNodeFs()
  const {
    env = process.env,
    exists = fs.existsSync,
    platform = process.platform,
  } = { __proto__: null, ...options } as OpenUrlOptions
  const override = env[BROWSER_BINARY_ENV_VAR]
  if (typeof override === 'string' && override !== '') {
    return exists(override) ? override : undefined
  }
  const candidates = NEW_WINDOW_BROWSERS[platform] ?? []
  for (let i = 0, { length } = candidates; i < length; i += 1) {
    const candidate = candidates[i]!
    if (exists(candidate)) {
      return candidate
    }
  }
  return undefined
}
