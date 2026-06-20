/**
 * @file The rolldown bundle entry. The CJS bundle has no `import.meta`, so the
 *   dispatcher's source-level entrypoint guard can't gate execution here — this
 *   thin entry calls the CLI unconditionally. The hand-written `index.cjs`
 *   loader turns on the V8 compile cache, then `require()`s the bundle this
 *   compiles to.
 */

import { runDispatcherCli } from './dispatch.mts'

runDispatcherCli().catch(() => {
  process.exit(0)
})
