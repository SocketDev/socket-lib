/**
 * @file Lazy-loader for `node:events`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeEvents from 'node:events'

import { IS_NODE } from '../constants/runtime'

let events: typeof NodeEvents | undefined

export function getNodeEvents(): typeof NodeEvents {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeEvents
  }
  return (events ??= /*@__PURE__*/ require('node:events') as typeof NodeEvents)
}
