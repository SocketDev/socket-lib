/**
 * @file Detect which Node version manager is active on this machine and emit a
 *   targeted upgrade hint. Used when a tool needs Node ≥ X and wants to tell
 *   the user the exact command to run instead of a generic "install newer Node"
 *   line. Detection is best-effort:
 *
 *   1. **process.execPath** — the running Node binary's path is the most reliable
 *      signal. `~/.nvm/versions/node/...`, `~/.volta/tools/...`, `~/.fnm/...`,
 *      `~/.asdf/installs/nodejs/...`, `~/n/...` each have well-known directory
 *      shapes.
 *   2. **Environment variables** — `NVM_DIR`, `FNM_DIR`, `FNM_MULTISHELL_PATH`,
 *      `VOLTA_HOME`, `ASDF_DIR`, `N_PREFIX`. These are set by the shell
 *      integration each manager ships.
 *   3. **Corepack** — Node's bundled package-manager shim. Detected via
 *      `COREPACK_*` env vars or by the Node binary being under
 *      `corepack/shims/`. If none match, the manager is reported as `'system'`
 *      (Homebrew, apt, the .pkg installer, etc.) — for those, the upgrade hint
 *      is generic. This module does NOT shell out — every probe is in-process
 *      (env reads + path string inspection). That keeps it cheap to call and
 *      safe for the native-messaging host context, where stdout is reserved for
 *      the Chrome protocol.
 */

import process from 'node:process'

import { getEnvValue } from './rewire'

export type NodeVersionManager =
  | 'asdf'
  | 'corepack'
  | 'fnm'
  | 'n'
  | 'nvm'
  | 'system'
  | 'volta'

/**
 * Detect the Node version manager currently providing `process.execPath`.
 * Returns `'system'` when no manager is detected — the user is running a Node
 * installed by the OS package manager, the official .pkg/.msi installer, or a
 * manually placed binary.
 *
 * @example
 *   ;```typescript
 *   detectActiveNodeManager() // 'nvm' | 'fnm' | 'volta' | 'asdf' | 'n' | 'corepack' | 'system'
 *   ```
 */
export function detectActiveNodeManager(): NodeVersionManager {
  const exec = process.execPath
  // Path-based detection wins — it tells us where the *running* node came
  // from, regardless of what env vars are set. A user can have NVM_DIR set
  // but still be running a Volta-managed node.
  if (/[/\\]\.nvm[/\\]versions[/\\]node[/\\]/.test(exec)) {
    return 'nvm'
  }
  if (/[/\\]\.fnm[/\\]/.test(exec) || /[/\\]fnm_multishells[/\\]/.test(exec)) {
    return 'fnm'
  }
  if (/[/\\]\.volta[/\\]tools[/\\]/.test(exec)) {
    return 'volta'
  }
  if (/[/\\]\.asdf[/\\]installs[/\\]nodejs[/\\]/.test(exec)) {
    return 'asdf'
  }
  if (/[/\\]n[/\\]versions[/\\]node[/\\]/.test(exec)) {
    return 'n'
  }
  if (/[/\\]corepack[/\\]shims[/\\]/.test(exec)) {
    return 'corepack'
  }
  // Fall back to env vars. These say "a manager is installed and integrated
  // with the shell" but don't prove the current node came from it.
  if (getEnvValue('NVM_DIR')) {
    return 'nvm'
  }
  if (getEnvValue('FNM_DIR') || getEnvValue('FNM_MULTISHELL_PATH')) {
    return 'fnm'
  }
  if (getEnvValue('VOLTA_HOME')) {
    return 'volta'
  }
  if (getEnvValue('ASDF_DIR')) {
    return 'asdf'
  }
  if (getEnvValue('N_PREFIX')) {
    return 'n'
  }
  if (getEnvValue('COREPACK_HOME')) {
    return 'corepack'
  }
  return 'system'
}

/**
 * Produce the exact shell command a user should run to install + activate
 * `targetVersion` under the named manager. The command is single-line and
 * intended to be embedded in an error message verbatim.
 *
 * @example
 *   ;```typescript
 *   nodeManagerUpgradeHint('nvm', '22.6.0')
 *   // 'nvm install 22.6.0 && nvm use 22.6.0'
 *
 *   nodeManagerUpgradeHint('system', '22.6.0')
 *   // 'Install Node 22.6.0+ from https://nodejs.org/'
 *   ```
 *
 * @param manager - The detected Node version manager.
 * @param targetVersion - Semver-shaped version, e.g. `'22.6.0'` or `'22'`.
 */
export function nodeManagerUpgradeHint(
  manager: NodeVersionManager,
  targetVersion: string,
): string {
  switch (manager) {
    case 'asdf':
      return `asdf install nodejs ${targetVersion} && asdf global nodejs ${targetVersion}`
    case 'corepack':
      // Corepack shims package managers, not Node itself — escalate to a
      // real manager.
      return `Corepack manages package managers, not Node. Install Node ${targetVersion}+ via nvm/fnm/volta or from https://nodejs.org/`
    case 'fnm':
      return `fnm install ${targetVersion} && fnm use ${targetVersion}`
    case 'n':
      return `n ${targetVersion}`
    case 'nvm':
      return `nvm install ${targetVersion} && nvm use ${targetVersion}`
    case 'volta':
      return `volta install node@${targetVersion}`
    case 'system':
    default:
      return `Install Node ${targetVersion}+ from https://nodejs.org/`
  }
}
