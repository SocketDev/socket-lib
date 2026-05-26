/**
 * @file Public `Logger` class entry — re-exports the platform-correct
 *   implementation. Bundlers that honor the package.json `'browser'` condition
 *   (rolldown, vite, esbuild on browser platform) swap this entry to
 *   `./browser`; Node consumers get `./node`. Same named export (`Logger`) on
 *   both platforms so callers can write `import { Logger } from
 *   '@socketsecurity/lib/logger/logger'` without caring about platform. For the
 *   singleton accessor, use `./default` (`getDefaultLogger()`).
 */

export { Logger } from './node'
