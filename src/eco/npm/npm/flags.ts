/**
 * @file Npm CLI flag predicates. Each predicate identifies whether a single
 *   argv entry matches a specific npm flag family. They're side-effect-free
 *   pure functions marked `@__NO_SIDE_EFFECTS__` so bundlers can tree-shake
 *   unused predicates out of consumer bundles.
 */

/**
 * Check if a command argument is an npm audit flag.
 *
 * @example
 *   ;```typescript
 *   isNpmAuditFlag('--no-audit') // true
 *   isNpmAuditFlag('--audit') // true
 *   isNpmAuditFlag('--save') // false
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isNpmAuditFlag(cmdArg: string): boolean {
  return /^--(no-)?audit(=.*)?$/.test(cmdArg)
}

/**
 * Check if a command argument is an npm fund flag.
 *
 * @example
 *   ;```typescript
 *   isNpmFundFlag('--no-fund') // true
 *   isNpmFundFlag('--fund') // true
 *   isNpmFundFlag('--save') // false
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isNpmFundFlag(cmdArg: string): boolean {
  return /^--(no-)?fund(=.*)?$/.test(cmdArg)
}

/**
 * Check if a command argument is an npm loglevel flag.
 *
 * @example
 *   ;```typescript
 *   isNpmLoglevelFlag('--loglevel') // true
 *   isNpmLoglevelFlag('--silent') // true
 *   isNpmLoglevelFlag('-s') // true
 *   isNpmLoglevelFlag('--save') // false
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isNpmLoglevelFlag(cmdArg: string): boolean {
  // https://docs.npmjs.com/cli/v11/using-npm/logging#setting-log-levels
  if (/^--loglevel(=.*)?$/.test(cmdArg)) {
    return true
  }
  if (/^--(silent|verbose|info|warn|error|quiet)$/.test(cmdArg)) {
    return true
  }
  return /^-(s|q|d|dd|ddd|v)$/.test(cmdArg)
}

/**
 * Check if a command argument is an npm node-options flag.
 *
 * @example
 *   ;```typescript
 *   isNpmNodeOptionsFlag('--node-options') // true
 *   isNpmNodeOptionsFlag('--node-options=--max-old-space-size=4096') // true
 *   isNpmNodeOptionsFlag('--save') // false
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isNpmNodeOptionsFlag(cmdArg: string): boolean {
  // https://docs.npmjs.com/cli/v9/using-npm/config#node-options
  return /^--node-options(=.*)?$/.test(cmdArg)
}

/**
 * Check if a command argument is an npm progress flag.
 *
 * @example
 *   ;```typescript
 *   isNpmProgressFlag('--no-progress') // true
 *   isNpmProgressFlag('--progress') // true
 *   isNpmProgressFlag('--save') // false
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isNpmProgressFlag(cmdArg: string): boolean {
  return /^--(no-)?progress(=.*)?$/.test(cmdArg)
}
