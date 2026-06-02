/**
 * @file Unit tests for Node version manager detection. Covers
 *   detectActiveNodeManager() (env + execPath probing for nvm/fnm/volta/
 *   asdf/n/corepack/system) and nodeManagerUpgradeHint() (per-manager upgrade
 *   command formatting). `process.execPath` is mocked per test via vi.spyOn so
 *   each manager's path shape can be exercised cleanly. Env overrides go
 *   through the rewire layer (`setEnv` / `clearEnv` / `resetEnv`) so we don't
 *   pollute the real process.env.
 */

import process from 'node:process'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  detectActiveNodeManager,
  nodeManagerUpgradeHint,
} from '../../../src/env/node-version-managers'
import { resetEnv, setEnv } from '../../../src/env/rewire'

// Mask the host machine's manager env vars to undefined. clearEnv only
// drops the override layer, which means tests inherit whatever NVM_DIR /
// VOLTA_HOME etc. the dev machine has set — flaky. setEnv(key, undefined)
// forces a sticky `undefined` so getEnvValue short-circuits before
// falling through to the real process.env.
function maskAllManagerEnv(): void {
  setEnv('NVM_DIR', undefined)
  setEnv('FNM_DIR', undefined)
  setEnv('FNM_MULTISHELL_PATH', undefined)
  setEnv('VOLTA_HOME', undefined)
  setEnv('ASDF_DIR', undefined)
  setEnv('N_PREFIX', undefined)
  setEnv('COREPACK_HOME', undefined)
}

function withExecPath(execPath: string): void {
  vi.spyOn(process, 'execPath', 'get').mockReturnValue(execPath)
}

describe('env/node-version-managers', () => {
  afterEach(() => {
    resetEnv()
    vi.restoreAllMocks()
  })

  describe('detectActiveNodeManager (path-based)', () => {
    it('detects nvm from execPath', () => {
      maskAllManagerEnv()
      withExecPath('/Users/<user>/.nvm/versions/node/v22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('nvm')
    })

    it('detects fnm from .fnm path', () => {
      maskAllManagerEnv()
      withExecPath(
        '/Users/<user>/.fnm/node-versions/v22.11.0/installation/bin/node',
      )
      expect(detectActiveNodeManager()).toBe('fnm')
    })

    it('detects fnm from fnm_multishells path', () => {
      maskAllManagerEnv()
      withExecPath('/tmp/fnm_multishells/12345_1700000000000/bin/node')
      expect(detectActiveNodeManager()).toBe('fnm')
    })

    it('detects volta from execPath', () => {
      maskAllManagerEnv()
      withExecPath('/Users/<user>/.volta/tools/image/node/22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('volta')
    })

    it('detects asdf from execPath', () => {
      maskAllManagerEnv()
      withExecPath('/Users/<user>/.asdf/installs/nodejs/22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('asdf')
    })

    it('detects n from execPath', () => {
      maskAllManagerEnv()
      withExecPath('/usr/local/n/versions/node/22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('n')
    })

    it('detects corepack from shims path', () => {
      maskAllManagerEnv()
      // oxlint-disable-next-line socket/prefer-node-modules-dot-cache -- fixture path mirrors corepack's real user-home install location, not a repo-root cache.
      withExecPath('/Users/<user>/.cache/node/corepack/shims/node')
      expect(detectActiveNodeManager()).toBe('corepack')
    })

    it('detects nvm on Windows-style path', () => {
      maskAllManagerEnv()
      withExecPath(
        'C:\\Users\\<USERNAME>\\.nvm\\versions\\node\\v22.11.0\\node.exe',
      )
      expect(detectActiveNodeManager()).toBe('nvm')
    })
  })

  describe('detectActiveNodeManager (env-based fallback)', () => {
    it('falls back to nvm when NVM_DIR is set but path is unrelated', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('NVM_DIR', '/Users/<user>/.nvm')
      expect(detectActiveNodeManager()).toBe('nvm')
    })

    it('falls back to fnm via FNM_DIR', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('FNM_DIR', '/Users/<user>/.fnm')
      expect(detectActiveNodeManager()).toBe('fnm')
    })

    it('falls back to fnm via FNM_MULTISHELL_PATH', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('FNM_MULTISHELL_PATH', '/tmp/fnm_multishells/abc')
      expect(detectActiveNodeManager()).toBe('fnm')
    })

    it('falls back to volta via VOLTA_HOME', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('VOLTA_HOME', '/Users/<user>/.volta')
      expect(detectActiveNodeManager()).toBe('volta')
    })

    it('falls back to asdf via ASDF_DIR', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('ASDF_DIR', '/Users/<user>/.asdf')
      expect(detectActiveNodeManager()).toBe('asdf')
    })

    it('falls back to n via N_PREFIX', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('N_PREFIX', '/usr/local')
      expect(detectActiveNodeManager()).toBe('n')
    })

    it('falls back to corepack via COREPACK_HOME', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      // oxlint-disable-next-line socket/prefer-node-modules-dot-cache -- fixture path mirrors corepack's real user-home install location, not a repo-root cache.
      setEnv('COREPACK_HOME', '/Users/<user>/.cache/node/corepack')
      expect(detectActiveNodeManager()).toBe('corepack')
    })

    it('returns system when no manager evidence is present', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      expect(detectActiveNodeManager()).toBe('system')
    })
  })

  describe('detectActiveNodeManager (precedence)', () => {
    it('path beats env: volta path wins over NVM_DIR env', () => {
      // A user can have NVM_DIR set (legacy nvm install) but currently
      // be running a Volta-managed node. Path-based detection takes
      // precedence so we name the *active* manager, not just any
      // installed one.
      maskAllManagerEnv()
      setEnv('NVM_DIR', '/Users/<user>/.nvm')
      withExecPath('/Users/<user>/.volta/tools/image/node/22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('volta')
    })

    it('path beats env: nvm path wins over VOLTA_HOME env', () => {
      maskAllManagerEnv()
      setEnv('VOLTA_HOME', '/Users/<user>/.volta')
      withExecPath('/Users/<user>/.nvm/versions/node/v22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('nvm')
    })

    it('path beats env: fnm path wins over ASDF_DIR env', () => {
      maskAllManagerEnv()
      setEnv('ASDF_DIR', '/Users/<user>/.asdf')
      withExecPath(
        '/Users/<user>/.fnm/node-versions/v22.11.0/installation/bin/node',
      )
      expect(detectActiveNodeManager()).toBe('fnm')
    })

    it('path beats env: asdf path wins over N_PREFIX env', () => {
      maskAllManagerEnv()
      setEnv('N_PREFIX', '/usr/local')
      withExecPath('/Users/<user>/.asdf/installs/nodejs/22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('asdf')
    })

    it('path beats env: n path wins over COREPACK_HOME env', () => {
      maskAllManagerEnv()
      // oxlint-disable-next-line socket/prefer-node-modules-dot-cache -- fixture path mirrors corepack's real user-home install location, not a repo-root cache.
      setEnv('COREPACK_HOME', '/Users/<user>/.cache/node/corepack')
      withExecPath('/usr/local/n/versions/node/22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('n')
    })

    it('path beats env: corepack path wins over NVM_DIR env', () => {
      maskAllManagerEnv()
      setEnv('NVM_DIR', '/Users/<user>/.nvm')
      // oxlint-disable-next-line socket/prefer-node-modules-dot-cache -- fixture path mirrors corepack's real user-home install location, not a repo-root cache.
      withExecPath('/Users/<user>/.cache/node/corepack/shims/node')
      expect(detectActiveNodeManager()).toBe('corepack')
    })

    it('nvm env wins when all env vars are set (highest precedence)', () => {
      // When the path doesn't match anything and multiple env vars are
      // set (rare but possible — e.g. a user shell with eager init for
      // every manager), nvm wins because it's checked first.
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('NVM_DIR', '/Users/<user>/.nvm')
      setEnv('FNM_DIR', '/Users/<user>/.fnm')
      setEnv('VOLTA_HOME', '/Users/<user>/.volta')
      setEnv('ASDF_DIR', '/Users/<user>/.asdf')
      setEnv('N_PREFIX', '/usr/local')
      // oxlint-disable-next-line socket/prefer-node-modules-dot-cache -- fixture path mirrors corepack's real user-home install location, not a repo-root cache.
      setEnv('COREPACK_HOME', '/Users/<user>/.cache/node/corepack')
      expect(detectActiveNodeManager()).toBe('nvm')
    })

    it('fnm env: FNM_DIR alone is enough', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('FNM_DIR', '/Users/<user>/.fnm')
      expect(detectActiveNodeManager()).toBe('fnm')
    })

    it('fnm env: FNM_MULTISHELL_PATH alone is enough', () => {
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('FNM_MULTISHELL_PATH', '/tmp/fnm_multishells/abc')
      expect(detectActiveNodeManager()).toBe('fnm')
    })
  })

  describe('detectActiveNodeManager (edge cases)', () => {
    it('empty-string env values do NOT trigger fallback (falsy)', () => {
      // getEnvValue('NVM_DIR') returns '' here; the implementation uses
      // truthy checks (`if (getEnvValue(...))`) so '' should not count
      // as "manager installed".
      withExecPath('/opt/homebrew/bin/node')
      maskAllManagerEnv()
      setEnv('NVM_DIR', '')
      setEnv('FNM_DIR', '')
      setEnv('VOLTA_HOME', '')
      setEnv('ASDF_DIR', '')
      setEnv('N_PREFIX', '')
      setEnv('COREPACK_HOME', '')
      expect(detectActiveNodeManager()).toBe('system')
    })

    it('does not mis-detect `.nvm-archive` (path-prefix false positive)', () => {
      // The regex requires `.nvm/versions/node/` — a related but distinct
      // path shape (someone's archived nvm config) must not match.
      maskAllManagerEnv()
      withExecPath('/Users/<user>/.nvm-archive/old-node/bin/node')
      expect(detectActiveNodeManager()).toBe('system')
    })

    it('does not mis-detect `voltaic/tools` (substring false positive)', () => {
      // `.volta/tools/` requires the leading dot. `voltaic/tools/` is a
      // hypothetical foreign path that shares the substring.
      maskAllManagerEnv()
      withExecPath('/Users/<user>/voltaic/tools/image/node/22.11.0/bin/node')
      expect(detectActiveNodeManager()).toBe('system')
    })

    it('does not mis-detect `nodejs-asdf-test` (substring false positive)', () => {
      // `.asdf/installs/nodejs/` is the canonical asdf node install path.
      // A random directory containing "asdf" as a substring must not
      // match.
      maskAllManagerEnv()
      withExecPath('/Users/<user>/nodejs-asdf-test/bin/node')
      expect(detectActiveNodeManager()).toBe('system')
    })

    it('detects volta on Windows-style path', () => {
      maskAllManagerEnv()
      withExecPath(
        'C:\\Users\\<USERNAME>\\.volta\\tools\\image\\node\\22.11.0\\node.exe',
      )
      expect(detectActiveNodeManager()).toBe('volta')
    })

    it('detects fnm on Windows-style path', () => {
      maskAllManagerEnv()
      withExecPath(
        'C:\\Users\\<USERNAME>\\.fnm\\node-versions\\v22.11.0\\installation\\node.exe',
      )
      expect(detectActiveNodeManager()).toBe('fnm')
    })

    it('detects asdf on Windows-style path', () => {
      maskAllManagerEnv()
      withExecPath(
        'C:\\Users\\<USERNAME>\\.asdf\\installs\\nodejs\\22.11.0\\node.exe',
      )
      expect(detectActiveNodeManager()).toBe('asdf')
    })

    it('detects n on Windows-style path', () => {
      maskAllManagerEnv()
      withExecPath('C:\\Tools\\n\\versions\\node\\22.11.0\\node.exe')
      expect(detectActiveNodeManager()).toBe('n')
    })

    it('detects corepack on Windows-style path', () => {
      maskAllManagerEnv()
      // oxlint-disable-next-line socket/prefer-node-modules-dot-cache -- fixture path mirrors corepack's real user-home install location, not a repo-root cache.
      withExecPath('C:\\Users\\<USERNAME>\\.cache\\node\\corepack\\shims\\node.exe')
      expect(detectActiveNodeManager()).toBe('corepack')
    })

    it('returns one of the seven declared manager values', () => {
      // Type-level exhaustiveness check: the runtime return value must
      // always be one of the union members.
      maskAllManagerEnv()
      withExecPath('/opt/homebrew/bin/node')
      const result = detectActiveNodeManager()
      expect([
        'asdf',
        'corepack',
        'fnm',
        'n',
        'nvm',
        'system',
        'volta',
      ]).toContain(result)
    })
  })

  describe('nodeManagerUpgradeHint', () => {
    it('emits nvm install + use', () => {
      expect(nodeManagerUpgradeHint('nvm', '22.6.0')).toBe(
        'nvm install 22.6.0 && nvm use 22.6.0',
      )
    })

    it('emits fnm install + use', () => {
      expect(nodeManagerUpgradeHint('fnm', '22.6.0')).toBe(
        'fnm install 22.6.0 && fnm use 22.6.0',
      )
    })

    it('emits volta install node@<version>', () => {
      expect(nodeManagerUpgradeHint('volta', '22.6.0')).toBe(
        'volta install node@22.6.0',
      )
    })

    it('emits asdf install + global nodejs', () => {
      expect(nodeManagerUpgradeHint('asdf', '22.6.0')).toBe(
        'asdf install nodejs 22.6.0 && asdf global nodejs 22.6.0',
      )
    })

    it('emits bare n <version>', () => {
      expect(nodeManagerUpgradeHint('n', '22.6.0')).toBe('n 22.6.0')
    })

    it('explains that corepack does not manage Node', () => {
      // Corepack shims package managers, not Node itself.
      expect(nodeManagerUpgradeHint('corepack', '22.6.0')).toContain(
        'Corepack manages package managers, not Node',
      )
      expect(nodeManagerUpgradeHint('corepack', '22.6.0')).toContain('22.6.0')
    })

    it('falls back to a generic nodejs.org link for system', () => {
      expect(nodeManagerUpgradeHint('system', '22.6.0')).toBe(
        'Install Node 22.6.0+ from https://nodejs.org/',
      )
    })

    it('embeds the target version verbatim across all managers', () => {
      // Catches regressions if a manager's command shape drops the
      // version interpolation.
      const target = '99.99.99'
      const managers = [
        'asdf',
        'corepack',
        'fnm',
        'n',
        'nvm',
        'system',
        'volta',
      ] as const
      for (const m of managers) {
        expect(nodeManagerUpgradeHint(m, target)).toContain(target)
      }
    })

    it('handles a bare major version like "22"', () => {
      // JSDoc declares this is supported: e.g. nvm install 22.
      expect(nodeManagerUpgradeHint('nvm', '22')).toBe(
        'nvm install 22 && nvm use 22',
      )
      expect(nodeManagerUpgradeHint('volta', '22')).toBe(
        'volta install node@22',
      )
      expect(nodeManagerUpgradeHint('n', '22')).toBe('n 22')
    })

    it('handles a prerelease version like "22.0.0-rc.1"', () => {
      expect(nodeManagerUpgradeHint('nvm', '22.0.0-rc.1')).toBe(
        'nvm install 22.0.0-rc.1 && nvm use 22.0.0-rc.1',
      )
      expect(nodeManagerUpgradeHint('volta', '22.0.0-rc.1')).toBe(
        'volta install node@22.0.0-rc.1',
      )
      expect(nodeManagerUpgradeHint('asdf', '22.0.0-rc.1')).toBe(
        'asdf install nodejs 22.0.0-rc.1 && asdf global nodejs 22.0.0-rc.1',
      )
    })

    it('handles an empty version string (degenerate but not crashing)', () => {
      // Not a typical caller shape, but the function shouldn't throw —
      // it just interpolates the empty string verbatim. Callers are
      // responsible for passing meaningful versions.
      expect(nodeManagerUpgradeHint('nvm', '')).toBe('nvm install  && nvm use ')
      expect(nodeManagerUpgradeHint('system', '')).toBe(
        'Install Node + from https://nodejs.org/',
      )
    })

    it('produces a single-line command for every shell-runnable manager', () => {
      // The contract: managers whose hint is a literal shell command
      // (everyone except corepack/system, which return prose) must fit
      // on one line — so an error message can embed them verbatim.
      const shellManagers = ['asdf', 'fnm', 'n', 'nvm', 'volta'] as const
      for (const m of shellManagers) {
        const hint = nodeManagerUpgradeHint(m, '22.6.0')
        expect(hint).not.toContain('\n')
      }
    })

    it('every hint mentions the manager name (round-trip readability)', () => {
      // A user reading the error should immediately see which manager
      // is being addressed. (system + corepack make this clear via
      // prose; the others embed the bin name.)
      expect(nodeManagerUpgradeHint('nvm', '22.6.0')).toContain('nvm')
      expect(nodeManagerUpgradeHint('fnm', '22.6.0')).toContain('fnm')
      expect(nodeManagerUpgradeHint('volta', '22.6.0')).toContain('volta')
      expect(nodeManagerUpgradeHint('asdf', '22.6.0')).toContain('asdf')
      expect(nodeManagerUpgradeHint('n', '22.6.0')).toMatch(/\bn\b/)
      expect(nodeManagerUpgradeHint('corepack', '22.6.0')).toContain('Corepack')
      expect(nodeManagerUpgradeHint('system', '22.6.0')).toContain('Node')
    })
  })
})
