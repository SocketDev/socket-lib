// Perry native-compile fixture. Imports a smol-touching socket-lib surface so
// that compiling this entry exercises the `requireBuiltin` deferral in
// src/node/module.ts (the node:smol-* loaders). With `@socketsecurity/lib` in
// perry.compilePackages, Perry compiles it from src/*.ts natively (no V8
// runtime), under lockdown + strict. On a non-smol host isSmol() is false and
// the JS fallback path is taken; the point is that it compiles + runs at all.
import { isSmol } from '@socketsecurity/lib/smol/detect'

const result = isSmol()
if (typeof result !== 'boolean') {
  throw new Error(`isSmol returned ${typeof result}, expected boolean`)
}
