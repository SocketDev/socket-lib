# `src/smol/` — feature-detect adapters for socket-btm's `node:smol-*` builtins

This directory is the lib's **bridge** to the `node:smol-*` builtins that ship with [socket-btm](https://github.com/SocketDev/socket-btm)'s smol Node binary. On stock Node + non-Node runtimes the bindings are unavailable, so every entry point here returns `undefined` and the consumer falls back to its JS-only implementation.

## How it works

`detect.ts` exposes `isSmol()` — a memoized probe via `require('node:module').isBuiltin('node:smol-util')`. Every `getSmol<X>()` lazy-loader gates its `require('node:smol-<x>')` call on this probe so stock Node never even attempts the require.

The shape of each loader is uniform:

```ts
let _smolX: SmolXBinding | null | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getSmolX(): SmolXBinding | undefined {
  if (_smolX === undefined) {
    if (isSmol()) {
      try {
        _smolX = require('node:smol-x') as SmolXBinding
      } catch {
        _smolX = undefined
      }
    } else {
      _smolX = undefined
    }
  }
  return _smolX ?? undefined
}
```

Each loader exports a typed `SmolXBinding` interface that mirrors the canonical shape in socket-btm's `additions/source-patched/lib/smol-x.js`. Consumers route the hot path through the loader and fall back transparently:

```ts
import { getSmolPrimordial } from '../smol/primordial'

const _smolPrimordial = getSmolPrimordial()
export const MathAbs = _smolPrimordial?.mathAbs ?? Math.abs
```

## Adopted modules

| File            | Binding                | What it accelerates                                                                                                                                                                     | Consumers                                                              |
| --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `detect.ts`     | `node:smol-util`       | `uncurryThis`, `applyBind`, `applySafe`, `bindCall`, `weakRefSafe` — V8 Fast API replacements for the JS `bind.bind(call)(fn)` idiom.                                                   | `src/primordials/uncurry.ts`, `src/primordials/reflect.ts`             |
| `primordial.ts` | `node:smol-primordial` | `Math.*`, `Number.is*`, `Array.isArray`, `Date.now`, `String.prototype.charCodeAt`, `Number.parseInt/parseFloat` — registered as `v8::CFunction` so V8 inlines them into JIT'd callers. | `src/primordials/{math,number,date,array,string}.ts`                   |
| `purl.ts`       | `node:smol-purl`       | PURL parse / build / normalize / equals — C++-accelerated with a 10 000-entry result cache.                                                                                             | `src/packages/specs.ts` (`resolveRegistryPackageName`)                 |
| `versions.ts`   | `node:smol-versions`   | Multi-ecosystem version comparison + range-satisfies — npm hot path goes through `internalBinding('smol_versions_native')`.                                                             | `src/versions/_internal.ts` (`getImpl()` resolves lazily on first use) |

## Not adopted (and why)

socket-btm's smol binary exposes 12 user-facing `node:smol-*` modules. The 8 not wrapped here:

- **`node:smol-ffi`** — generic FFI / native calls. No FFI surface in the lib.
- **`node:smol-http`** / **`node:smol-https`** — pooled, buffered HTTP client. The lib's `http-request/*` requires streaming bodies, redirect chasing, `maxResponseSize` enforcement, hook lifecycle, and `stream: true` mode that resolves to an unconsumed `IncomingMessage` — none of which the smol client surfaces. The smol client is a Promise-returning, buffered, drop-everything-in-memory shape; a clean wrap would require rewriting the lib's surface around it.
- **`node:smol-ilp`** — QuestDB ILP wire protocol. No ILP surface in the lib.
- **`node:smol-manifest`** — package.json / lockfile parser. The lib's manifest module reads via the npm `read-package-json` chain, which uses pacote's normalization. Wrapping `parse(filename, content)` would skip the pacote normalization the lib relies on.
- **`node:smol-power`** — power-state / battery / CPU mode. No fit.
- **`node:smol-sql`** — SQL parser/builder. No SQL surface in the lib.
- **`node:smol-vfs`** — virtual filesystem. Fronting `lib/fs/*` for testing would require a deep refactor of every `fs/*` leaf to add a VFS-first try; out of scope for the feature-detect pattern as currently shaped.

## Adding a new loader

1. Pick the binding from socket-btm's `additions/source-patched/lib/smol-<x>.js` and read the `module.exports` to extract the surface.
2. Create `src/smol/<x>.ts` following the shape above. Export a typed `SmolXBinding` interface that mirrors the canonical shape.
3. Add a `./smol/<x>` entry to `package.json` `exports`. The build's `scripts/fleet/make-package-exports.mts` writes the `source / types / default` triplet.
4. Add `test/unit/smol/<x>.test.mts` that pins `getSmolX()` returning `undefined` on stock Node (the test runtime). The fast-path integration is verified by socket-btm's own tests running inside the smol binary.
5. Route the consumer site:
   - Hot per-call branching: `const _smol = getSmolX(); export const op = _smol?.op ?? jsOp`
   - One-shot (e.g. PURL parse on `resolveRegistryPackageName`): `const smol = getSmolX(); const result = smol ? smol.parse(input) : jsParse(input)`
   - Whole-module swap: resolve lazily on first use, not at module load, so importing a leaf stays V8-snapshot-safe (`src/versions/_internal.ts` — `getImpl()` memoizes `getSmolVersions() ?? getSemver()`; the vendored fallback's `require` is deferred to first call because it pins a native `[Foreign]` handle at module-eval).

## See also

- [socket-btm](https://github.com/SocketDev/socket-btm) — the upstream that builds the smol Node binary + ships the `node:smol-*` builtins.
- [socket-btm `additions/source-patched/lib/smol-*.js`](https://github.com/SocketDev/socket-btm/tree/main/packages/node-smol-builder/additions/source-patched/lib) — canonical JS bindings whose shape this directory mirrors.
