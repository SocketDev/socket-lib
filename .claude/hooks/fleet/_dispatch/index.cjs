#!/usr/bin/env node
'use strict'

// Hand-written thin loader for the fleet hook dispatch bundle. NOT bundled —
// it stays plain CJS so V8's compile cache reliably caches AND auto-flushes it
// (a type-stripped .mts loader did not auto-flush: a normal exit left zero
// cache files). It turns the compile cache on, pointing at the repo's
// node_modules/.cache/fleet-hooks dir, then requires the CJS bundle. The
// dispatcher reads the event from process.argv[2], which settings.json passes
// as `node .../_dispatch/index.cjs <Event>`.
//
// See docs/agents.md/fleet/hook-bundle.md.

const path = require('node:path')

// _dispatch/ -> fleet/ -> hooks/ -> .claude/ -> <repo-root>
const repoRoot = path.join(__dirname, '..', '..', '..', '..')
const cacheDir = path.join(repoRoot, 'node_modules', '.cache', 'fleet-hooks')

try {
  // Node >= 22.8.0. enableCompileCache caches the compiled bytecode for every
  // CJS module the bundle pulls in and flushes it to cacheDir on normal exit;
  // the next spawn skips recompilation.
  require('node:module').enableCompileCache(cacheDir)
} catch {
  // Older Node or a sandbox that forbids the cache dir: fall through and run
  // the bundle uncached rather than failing the hook.
}

try {
  require('./bundle.cjs')
} catch (e) {
  // Fail-open: a broken/missing bundle must never wedge a tool call. The
  // per-hook `node .../index.mts` invocations are the live path today; this
  // loader is the gated fast-path seam.
  process.stderr.write(
    '[fleet-hook-dispatch] bundle load failed (fail-open): ' +
      String(e && e.message ? e.message : e) +
      '\n',
  )
  process.exit(0)
}
