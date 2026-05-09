/**
 * @fileoverview npm-ecosystem package manager surface.
 *
 * The npm ecosystem encompasses every package manager that consumes
 * the npm registry and (mostly) reads package.json: npm, pnpm, the
 * three Yarn variants (Classic / Berry / ZPM), bun, and vlt. Each
 * gets its own subdir for the `exec*` function and version-specific
 * flag predicates.
 *
 * Future ecosystems land as siblings (eco/pypi/, eco/cargo/,
 * eco/maven/, etc.) when the lib needs to invoke them.
 *
 * This barrel re-exports the most-imported surface; for tighter
 * imports, callers can target the leaf paths directly:
 *   - @socketsecurity/lib/eco/npm/npm
 *   - @socketsecurity/lib/eco/npm/pnpm
 *   - @socketsecurity/lib/eco/npm/yarnpkg/yarn
 *   - etc.
 */

export { execNpm } from './npm/exec'
export {
  isNpmAuditFlag,
  isNpmFundFlag,
  isNpmLoglevelFlag,
  isNpmNodeOptionsFlag,
  isNpmProgressFlag,
} from './npm/flags'

export { execPnpm } from './pnpm/exec'
export type { PnpmOptions } from './pnpm/exec'
export {
  isPnpmFrozenLockfileFlag,
  isPnpmIgnoreScriptsFlag,
  isPnpmInstallCommand,
  isPnpmLoglevelFlag,
} from './pnpm/flags'

export { execYarn } from './yarnpkg/yarn/exec'

export { execBun } from './bun'
export { execVlt } from './vlt'

export { execScript } from './script'
export type { ExecScriptOptions } from './script'
