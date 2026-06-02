/**
 * @file Install the Socket native messaging host manifest so Chrome can find
 *   and launch the host when the extension calls connectNative(). Native host
 *   manifest paths (Chrome): macOS ~/Library/Application
 *   Support/Google/Chrome/NativeMessagingHosts/<name>.json
 *   ~/Library/Application Support/Chromium/NativeMessagingHosts/<name>.json
 *   Linux ~/.config/google-chrome/NativeMessagingHosts/<name>.json
 *   ~/.config/chromium/NativeMessagingHosts/<name>.json Windows
 *   HKCU\Software\Google\Chrome\NativeMessagingHosts<name> → path to .json The
 *   manifest points to a small wrapper shell script (POSIX) or .cmd (Windows)
 *   that invokes `node /path/to/socket-lib/src/native-messaging/run.ts` with
 *   the `--native-messaging` flag so the host can detect its context even when
 *   the extension origin arg is absent (e.g. during local testing). Strip-types
 *   flag policy (baked into the wrapper at install time): Node 24+ no flag
 *   needed (default-on). Node 22.6–23 pass `--strip-types` (stable since 22.6).
 *   Node < 22.6 refuse to install; assertNodeStripTypesSupported throws. If the
 *   user switches Node versions (e.g. via nvm) after install, the host enforces
 *   the same floor at runtime via assertNodeStripTypesSupported.
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import {
  getNodeVersion,
  supportsNodeStripTypes,
  supportsNodeStripTypesDefault,
} from '../constants/node'
import { DARWIN, WIN32 } from '../constants/platform'
import { getHome } from '../env/home'
import {
  detectActiveNodeManager,
  nodeManagerUpgradeHint,
} from '../env/node-version-managers'

export const HOST_NAME = 'dev.socket.trusted_publisher_host'

export const MIN_NODE_VERSION_FOR_STRIP_TYPES = '22.6.0'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Absolute path to the run.ts entry point in this package.
const HOST_SCRIPT = path.resolve(__dirname, 'run.ts')

export interface InstallOptions {
  /**
   * List of Chrome extension origin URLs that are allowed to connect to this
   * host. Each entry is `chrome-extension://<extension-id>/`. Pass `['*']`
   * during development to allow any extension; in `production: true` mode the
   * wildcard is rejected with an error (see the production option below).
   */
  allowedOrigins: string[]
  /**
   * When `true`, the installer refuses to write a manifest whose
   * `allowed_origins` includes the `'*'` wildcard. Use in production builds
   * where the published extension ID is known and the manifest should pin
   * exactly that ID. Dev / unsigned-extension flows leave this `false` (the
   * default) so loading an unpacked extension with an unstable ID still works.
   */
  production?: boolean | undefined
  /**
   * Directory to write the wrapper script. Defaults to the same directory as
   * this file (`src/native-messaging/`).
   */
  wrapperDir?: string | undefined
}

export interface InstallResult {
  manifestPaths: string[]
  wrapperPath: string
}

/**
 * Throw a clear, actionable error if the current Node runtime is too old to
 * strip TypeScript types (i.e. < 22.6). Use at install time + host startup.
 *
 * The error message names the active Node version manager (nvm / fnm / volta /
 * asdf / n / corepack / system) and gives the exact one-liner to upgrade — so
 * the user can copy-paste the fix rather than searching docs.
 */
export function assertNodeStripTypesSupported(): void {
  if (supportsNodeStripTypes()) {
    return
  }
  const manager = detectActiveNodeManager()
  const hint = nodeManagerUpgradeHint(manager, MIN_NODE_VERSION_FOR_STRIP_TYPES)
  throw new Error(
    `Node ${getNodeVersion()} cannot run TypeScript directly. The Socket ` +
      `native-messaging host needs Node ${MIN_NODE_VERSION_FOR_STRIP_TYPES}+ ` +
      `(type-stripping is stable in Node 22.6 and default-on in Node 24).\n` +
      `Detected Node manager: ${manager}\n` +
      `To upgrade: ${hint}`,
  )
}

export function buildManifest(
  wrapperPath: string,
  allowedOrigins: string[],
): object {
  return {
    name: HOST_NAME,
    description:
      'Socket Security — API token bridge for the Trusted Publisher extension',
    path: wrapperPath,
    type: 'stdio',
    allowed_origins: allowedOrigins,
  }
}

export function chromeManifestDirs(): string[] {
  const home = getHome()
  if (!home) {
    throw new Error('Cannot determine home directory.')
  }
  if (DARWIN) {
    const lib = path.join(home, 'Library', 'Application Support')
    return [
      path.join(lib, 'Google', 'Chrome', 'NativeMessagingHosts'),
      path.join(lib, 'Chromium', 'NativeMessagingHosts'),
    ]
  }
  if (WIN32) {
    // On Windows we write the manifest file and then add the registry key.
    const appData =
      process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming')
    return [
      path.join(
        appData,
        'Google',
        'Chrome',
        'User Data',
        'NativeMessagingHosts',
      ),
    ]
  }
  // Linux (XDG).
  const config = process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config')
  return [
    path.join(config, 'google-chrome', 'NativeMessagingHosts'),
    path.join(config, 'chromium', 'NativeMessagingHosts'),
  ]
}

export function installNativeHost(opts: InstallOptions): InstallResult {
  // Refuse to install on a Node too old to run the TypeScript host. The
  // host's own runtime check is defensive (handles nvm switches between
  // install and Chrome-exec); this one catches the obvious case where
  // the installer is itself on a stale Node.
  assertNodeStripTypesSupported()

  const { allowedOrigins, production = false, wrapperDir = __dirname } = opts

  // Production guard: any `'*'` in the allowed-origin list is a leak —
  // a foreign extension could connect and request the API token. Dev
  // mode tolerates it because unsigned extensions have unstable IDs.
  if (production && allowedOrigins.some(o => o === '*')) {
    throw new Error(
      `installNativeHost: production mode rejects allowedOrigins '*'. ` +
        `Pass the published extension ID instead: ` +
        `['chrome-extension://<id>/'].`,
    )
  }
  if (allowedOrigins.length === 0) {
    throw new Error(
      `installNativeHost: allowedOrigins must contain at least one entry. ` +
        `Use ['*'] for development (unsigned extension) or ` +
        `['chrome-extension://<id>/'] in production.`,
    )
  }

  const wrapperName = WIN32 ? `${HOST_NAME}.cmd` : `${HOST_NAME}.sh`
  const wrapperPath = path.join(wrapperDir, wrapperName)

  if (WIN32) {
    writeWrapperWindows(wrapperPath)
  } else {
    writeWrapperPosix(wrapperPath)
  }

  const manifest = buildManifest(wrapperPath, allowedOrigins)
  const dirs = chromeManifestDirs()
  const written: string[] = []

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true })
    const manifestPath = path.join(dir, `${HOST_NAME}.json`)
    writeFileSync(
      manifestPath,
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8',
    )
    written.push(manifestPath)
  }

  if (WIN32 && written[0]) {
    registerWindows(written[0])
  }

  return { manifestPaths: written, wrapperPath }
}

export function registerWindows(manifestPath: string): void {
  const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`
  // Array-arg spawnSync (no shell, no command injection). reg.exe is on
  // every Windows install at %SystemRoot%\System32\reg.exe and on PATH.
  spawnSync(
    'reg',
    ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'],
    { stdio: 'ignore', shell: WIN32 },
  )
}

export function stripTypesFlag(): string {
  // Empty string when no flag is needed (Node 24+); the wrapper template
  // collapses adjacent spaces away naturally.
  return supportsNodeStripTypesDefault() ? '' : '--strip-types '
}

export function writeWrapperPosix(wrapperPath: string): void {
  const nodeBin = process.execPath
  const flag = stripTypesFlag()
  const script =
    ['#!/bin/sh', `exec "${nodeBin}" ${flag}"${HOST_SCRIPT}" "$@"`].join('\n') +
    '\n'
  writeFileSync(wrapperPath, script, { encoding: 'utf8' })
  chmodSync(wrapperPath, 0o755)
}

export function writeWrapperWindows(wrapperPath: string): void {
  const nodeBin = process.execPath
  const flag = stripTypesFlag()
  const script = `@echo off\r\n"${nodeBin}" ${flag}"${HOST_SCRIPT}" %*\r\n`
  writeFileSync(wrapperPath, script, { encoding: 'utf8' })
}
