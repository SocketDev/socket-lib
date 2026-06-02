/**
 * @file Runtime environment detection constants. All checks use only
 *   `typeof`-safe global probes so this module is safe to import in browser,
 *   Node.js, Deno, Bun, and bundled contexts alike.
 */

/**
 * True when running inside a Node.js process. Detected via
 * `process.versions.node` — present in Node, absent in browsers and Deno/Bun
 * which expose a different `process.versions` shape (or no `process` at all).
 */
export const IS_NODE =
  typeof process !== 'undefined' &&
  typeof process.versions !== 'undefined' &&
  typeof process.versions.node === 'string'

/**
 * True when running in a browser context (window + document both defined).
 * Note: Chrome extensions have `window` in popup contexts but not in service
 * workers — check `IS_SERVICE_WORKER` for that case.
 */
export const IS_BROWSER =
  typeof window !== 'undefined' && typeof document !== 'undefined'

/**
 * True when running inside a Web Worker / Chrome MV3 service worker.
 * `self` is defined without `window` in worker contexts.
 */
export const IS_WORKER =
  typeof self !== 'undefined' &&
  typeof window === 'undefined' &&
  typeof document === 'undefined'
