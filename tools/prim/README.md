# prim

CLI for auditing and migrating JavaScript built-in usage to
[`@socketsecurity/lib/primordials`](https://github.com/SocketDev/socket-lib).

## What it does

Primordials capture references to JavaScript built-ins (`Object.keys`,
`Array.prototype.map`, `JSON.parse`, …) at module load time, before user
code can tamper with prototypes or globals. They're a hardening tool for
code that processes adversarial input.

`prim` answers two questions across a project's source / bundled output:

- **Coverage**: which call sites already have a primordial available
  (i.e. you can replace `arr.map(fn)` with `ArrayPrototypeMap(arr, fn)`
  today)?
- **Gaps**: which call sites have no matching primordial yet (and so
  the surface needs expansion in `socket-lib/src/primordials.ts`)?

It also includes a codemod (`prim mod`) that rewrites source files to
use primordials, and a structural linter (`prim lint`) that enforces
naming-convention rules for primordials destructure blocks.

## Install

`prim` is a workspace-only tool — it isn't published to npm and never
will be (`"private": true`). Two ways to run it:

```sh
# From inside socket-lib, use the root pnpm script:
pnpm prim --help
pnpm prim audit --target ../socket-cli

# From outside socket-lib (e.g. when auditing a sibling repo), invoke
# the bin directly:
node /path/to/socket-lib/tools/prim/bin/prim.mts --help
```

The `pnpm prim` form is the canonical way to run it during fleet
development — it always picks up the live source under `tools/prim/`.

## Usage

`prim` has three subcommands, each focused on one operation:

| Subcommand   | Purpose |
|---|---|
| `prim audit` | Find call sites where a primordial applies. Default shows both migration candidates (covered) and surface gaps (gap). Filter with `--coverage` or `--gaps`. |
| `prim mod`   | Codemod **JavaScript** source files to use primordials. Dry-run by default; `--apply` to write. TypeScript is out of scope (rewriting `.ts` requires source-mapping between stripped-types and original byte offsets) — `prim audit` still walks TS, so candidates are visible. |
| `prim lint`  | Structural lint rules for primordials destructure blocks. Currently: `ctor-rename` — constructor primordials (`Array`, `Set`, `TypeError`, …) must be aliased `<Name>: <Name>Ctor` when destructured from `primordials` (or any configured primordials-shaped source). Exits 1 on violations. |

```sh
# Show help
pnpm prim --help

# Find both migration candidates AND surface gaps:
pnpm prim audit --target ../socket-cli

# Only the gaps (what's missing from socket-lib's primordials):
pnpm prim audit --target ../socket-cli --gaps

# Only the migration candidates (what we could rewrite today):
pnpm prim audit --target . --dir src --coverage

# Dry-run a codemod over your source tree:
pnpm prim mod --target . --dir src

# Apply for real (only after reviewing the dry-run!):
pnpm prim mod --target . --dir src --apply

# Also rewrite prototype-method calls where the receiver type is
# guessed from the variable name (more aggressive — needs review):
pnpm prim mod --target . --dir src --include-guessed --apply

# Lint additions code for ctor-rename violations:
pnpm prim lint --target additions/source-patched --dir lib
```

## How it knows what's covered

`prim` resolves the primordials surface from one of three locations:

1. Explicit `--surface <path>` flag (audit/mod) — overrides everything.
   Use this to audit against Node's
   `lib/internal/per_context/primordials.js` or any other
   primordials-shaped source.
2. A sibling socket-lib checkout: `../socket-lib/src/primordials.ts`
   (used during fleet development — picks up unreleased exports).
3. The installed `@socketsecurity/lib/dist/primordials.js` in the
   target's `node_modules`.

Whichever it finds first wins.

When `--surface` points at a Node `per_context/primordials.js`, the
loader recognizes the path and dynamically computes the full surface
(~541 names) by enumerating the static + prototype methods of the
upstream globals (Array, Object, String, Number, Map, Set, Error,
RegExp, JSON, Math, Reflect, etc.) — the same names Node installs at
bootstrap via `copyPropsRenamed` + `copyPrototype` reflection.

## Design

- **Parser**: vendored acorn-wasm at `<socket-lib>/vendor/acorn-wasm`
  (originally from
  [sdxgen](https://github.com/SocketDev/sdxgen/tree/main/vendor/acorn-wasm))
  — no npm install needed, no network access.
- **TypeScript support**: `.ts`/`.mts`/`.cts`/`.tsx` files are stripped
  via Node's `module.stripTypeScriptTypes()` before parsing, so the
  audit walks source trees regardless of compilation state.
- **Heuristics**: receiver-type guessing for prototype-method calls
  (e.g. `arr.map(...)` → `Array`). False positives show up flagged
  with `[guessed: …]` so they can be dismissed manually.
- **Unambiguous-method map**: methods that exist on exactly one
  built-in type (`.toUpperCase` → String, `.getTime` → Date) are
  classified by the method name regardless of receiver, which is a
  stronger signal than the name heuristic.
- **Bundler-glue filter**: skips esbuild's CJS interop boilerplate
  (`Object.defineProperty(exports, "__esModule", ...)` and
  `var __defProp = Object.defineProperty;`) so audits of `dist/`
  trees don't drown in machine-generated noise.
