/**
 * @file Shared substrate for the zero-dep from-scratch bootstrap
 *   (setup-tools.mjs + lib/install-<tool>.mjs). Runs on SYSTEM Node BEFORE
 *   node_modules / pnpm exist, so it imports only `node:` builtins + sibling
 *   `.mjs` — never @socketsecurity/lib. Exports the dir layout + the tiny
 *   helpers (jq / installTool / detectPlatform / log / warn) every per-tool
 *   installer shares, so each installer is its own module under the 500-line
 *   cap and `local == CI` (the composite action runs the same code).
 *
 *   Path anchor: constants derive from THIS module's own location
 *   (setup/lib/bootstrap-common.mjs → setupDir = its parent), so they stay
 *   correct no matter which installer imports them.
 */

// oxlint-disable-next-line socket/prefer-async-spawn -- pre-pnpm bootstrap: runs before node_modules exists, so the lib spawn wrapper isn't importable; sync child_process is the only option (same constraint as lib/install-tool.mjs).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// This file lives in setup/lib/; the setup dir (holding external-tools.json +
// the CLI leaf scripts) is one up.
export const LIB = __dirname
export const SETUP_DIR = path.dirname(__dirname)
export const TOOLS_FILE = path.join(SETUP_DIR, 'external-tools.json')

// Walk up from a start dir to the nearest package.json = the repo root the
// bootstrap seeds node_modules into. Dependency-free walk (the fleet
// findUpPackageJson imports @socketsecurity/lib-stable, not on disk yet).
export function findRepoRoot(from) {
  let dir = from
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return from
    }
    dir = parent
  }
}

// _wheelhouse tool layout — Lock-step with @socketsecurity/lib
// src/paths/socket.ts: BIN_DIR == getSocketWheelhouseBinDir() (the one PATH
// entry, flat handles), RACK_DIR == getSocketRackDir() (real binaries racked
// as rack/<tool>/<version>/…). Hard-coded here (not imported) because this
// bootstrap runs before @socketsecurity/lib is on disk.
export const SOCKET_HOME = path.join(os.homedir(), '.socket')
export const WHEELHOUSE_DIR = path.join(SOCKET_HOME, '_wheelhouse')
export const RACK_DIR = path.join(WHEELHOUSE_DIR, 'rack')
export const BIN_DIR = path.join(WHEELHOUSE_DIR, 'bin')
// PNPM_HOME is the standard pnpm-standalone location; honor it if set so the
// installed pnpm lands where the user's PATH already expects it.
export const PNPM_DIR = process.env.PNPM_HOME || path.join(RACK_DIR, 'pnpm')
// sfw racks version-dir'd as rack/sfw/<version>/sfw — the SAME readable path
// install-sfw.mts exposes, so both installers agree.
export const SFW_RACK_DIR = path.join(RACK_DIR, 'sfw')
export const REPO_ROOT = findRepoRoot(__dirname)

export function log(msg) {
  // oxlint-disable-next-line socket/no-console-prefer-logger -- pre-pnpm bootstrap; @socketsecurity/lib-stable not installed yet.
  console.log(msg)
}

export function warn(msg) {
  // oxlint-disable-next-line socket/no-console-prefer-logger -- pre-pnpm bootstrap; @socketsecurity/lib-stable not installed yet.
  console.error(msg)
}

// Run `node <script> <args...>` and return trimmed stdout, or undefined when
// the script exits non-zero (the lib helpers exit non-zero on missing values).
export function nodeOut(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    return undefined
  }
  return typeof r.stdout === 'string' ? r.stdout.trim() : undefined
}

// Read a tool's value from external-tools.json via the canonical lib/jq.mjs
// reader (the exact path the CI action uses), so local + CI read identically.
// The data lives under the top-level `tools` map ({ tools: { <name>: … } }), so
// callers pass tool-relative keys (`jq('pnpm', 'version')`) and the `tools`
// root is prepended here — the one place that knows the container shape.
export function jq(...keys) {
  return nodeOut(path.join(LIB, 'jq.mjs'), [TOOLS_FILE, 'tools', ...keys])
}

// Canonical platform string via lib/platform.mjs (musl-aware), matching CI.
export function detectPlatform() {
  const p = nodeOut(path.join(LIB, 'platform.mjs'), [])
  if (!p) {
    warn('× could not detect platform (lib/platform.mjs failed)')
    process.exit(1)
  }
  return p
}

// Download + SRI-verify + extract via the canonical lib/install-tool.mjs.
export function installTool(url, integrity, destDir, binName) {
  const args = [url, integrity, destDir]
  if (binName) {
    args.push(binName)
  }
  const r = spawnSync(
    process.execPath,
    [path.join(LIB, 'install-tool.mjs'), ...args],
    { stdio: 'inherit' },
  )
  return r.status === 0
}

// Resolve a command's real path with the bin (shim) dir stripped from PATH, so
// we wrap the ACTUAL tool (not our own shim). Returns '' when not found.
export function resolveReal(cmd) {
  const cleanPath = process.env.PATH.split(path.delimiter)
    .filter(d => d !== BIN_DIR)
    .join(path.delimiter)
  const r = spawnSync('command', ['-v', cmd], {
    encoding: 'utf8',
    env: { __proto__: null, ...process.env, PATH: cleanPath },
    // prefer-shell-win32: intentional — `command -v` is a POSIX shell builtin,
    // not an executable, so it MUST run inside a shell on every platform; this
    // local bootstrap targets darwin/linux dev machines.
    shell: true,
  })
  if (r.status !== 0 || typeof r.stdout !== 'string') {
    return ''
  }
  return r.stdout.split('\n')[0]?.trim() ?? ''
}
