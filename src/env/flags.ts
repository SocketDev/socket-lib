/**
 * @file Environment flag booleans, re-exported from std-env — not
 *   reimplemented. std-env is a devDependency; the bundler inlines it, so dist
 *   carries the logic with no runtime std-env import.
 *   Only the flags socket-lib does NOT already own live here. CI, DEBUG,
 *   NODE_ENV, test, platform, and Node-version detection are handled by
 *   socket-lib's own rewire-aware getters and constants (`env/ci` `getCI`,
 *   `env/debug` `getDebug`, `env/node-env` `getNodeEnv`, `env/test` `isTest`,
 *   `constants/platform`, `constants/node`, `constants/runtime`), so std-env's
 *   overlapping flags are intentionally not re-exported.
 */

export { hasTTY, isColorSupported, isMinimal } from '../external/std-env'
