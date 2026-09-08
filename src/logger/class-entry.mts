/**
 * @file Public `Logger` class entry — re-exports the platform-correct
 *   implementation. Bundlers such as rolldown, vite, and esbuild on the
 *   browser platform honor the package.json `'browser'` condition and swap
 *   this entry to `./browser`; Node consumers get `./node`. Same named export
 *   (`Logger`) on both platforms so callers can write `import { Logger } from
 *   '@socketsecurity/lib/logger/logger'` without caring about platform. For
 *   the singleton accessor, use `./default` (`getDefaultLogger()`).
 */

export { Logger } from './node.mjs'
