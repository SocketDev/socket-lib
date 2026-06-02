/**
 * @file Lazy-loader for `node:timers/promises`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeTimersPromises from 'node:timers/promises'

import { IS_NODE } from '../constants/runtime'

let timersPromises: typeof NodeTimersPromises | undefined

export function getNodeTimersPromises(): typeof NodeTimersPromises {
  // Non-Node path returns undefined cast so bundlers still see no
  // static `require` and tree-shake the module; Node callers (the
  // entire `src/` tree) always traverse the `IS_NODE` branch and
  // get the real module — so the type narrowing is sound in practice.
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeTimersPromises
  }
  return (timersPromises ??=
    /*@__PURE__*/ require('node:timers/promises') as typeof NodeTimersPromises)
}
