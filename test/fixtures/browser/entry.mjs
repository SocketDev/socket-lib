// Browser-bundle entry. Imports a socket-lib surface whose module graph reaches
// node/module.ts and its bare `module` import. A browser bundler must stub
// `module` (via the lib's package.json `browser` field) rather than choke on a
// node: scheme. `.mjs` so the bundler needs no TypeScript loader — it resolves
// @socketsecurity/lib/node/module to the built dist (plain JS).
import { isNodeBuiltin } from '@socketsecurity/lib/node/module'

// Verify the browser-safe npm registry module bundles cleanly — no node:* in
// the import graph.
import { encodePackageName, parsePackument } from '@socketsecurity/lib/npm/registry'

export const result = isNodeBuiltin('fs')
export const npmResult = { encodePackageName, parsePackument }
