/**
 * @file JS runtime detection, re-exported from std-env — not reimplemented.
 *   std-env is a devDependency, inlined by the bundler.
 *   `isNode` is omitted: socket-lib's `constants/runtime` `IS_NODE` (a
 *   typeof-safe global probe) already owns Node detection. The edge/alt-runtime
 *   flags below have no socket-lib equivalent.
 */

export {
  isBun,
  isDeno,
  isEdgeLight,
  isFastly,
  isNetlify,
  isWorkerd,
  runtime,
  runtimeInfo,
} from '../external/std-env'
export type { RuntimeInfo, RuntimeName } from '../external/std-env'
