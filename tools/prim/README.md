# prim

CLI for auditing and migrating JavaScript built-in usage to
[`@socketsecurity/lib/primordials`](https://github.com/SocketDev/socket-lib).

## What it does

Primordials capture references to JavaScript built-ins (`Object.keys`,
`Array.prototype.map`, `JSON.parse`, …) at module load time, before user
code can tamper with prototypes or globals. They're a hardening tool for
code that processes adversarial input.

`prim` answers two questions across a project's bundled output:

- **Coverage**: which call sites already have a primordial available
  (i.e. you can replace `arr.map(fn)` with `ArrayPrototypeMap(arr, fn)`
  today)?
- **Gaps**: which call sites have no matching primordial yet (and so
  the surface needs expansion in `socket-lib/src/primordials.ts`)?

It also includes a codemod (`prim mod`) that rewrites source files to
use primordials, and a state file for tracking progress across runs.

## Install

```sh
# Local checkout, run directly:
node /path/to/socket-lib/tools/prim/bin/prim.mts --help
```

Once published to npm, `pnpm dlx prim` will work too.

## Usage

`prim` is a multi-command CLI. Each subcommand does one thing.

```sh
# Show help
prim --help

# Find call sites you could migrate today (existing primordials)
prim coverage --target ./socket-cli --dir dist

# Find gaps in the primordials surface (need socket-lib expansion)
prim gaps --target ./socket-cli

# Both at once, as a snapshot
prim audit --target ./socket-cli --update-state

# Inspect persisted state
prim state

# Dry-run a codemod over your source tree
prim mod --target . --dir src

# Apply for real (only after reviewing the dry-run!)
prim mod --target . --dir src --apply

# Also rewrite prototype-method calls where the receiver type is
# guessed from the variable name (more aggressive — needs review)
prim mod --target . --dir src --include-guessed --apply
```

### Subcommands

| Subcommand      | Purpose                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `prim coverage` | Report call sites in the target that could be migrated to existing primordials.                                                 |
| `prim gaps`     | Report call sites that need a primordial that doesn't exist yet — the input list for expanding `socket-lib/src/primordials.ts`. |
| `prim audit`    | Run `coverage` + `gaps` and (optionally) persist the snapshot to the state file.                                                |
| `prim state`    | Inspect the persisted state file.                                                                                               |
| `prim mod`      | Codemod source files to use primordials. Dry-run by default; pass `--apply` to write.                                           |

## How it knows what's covered

`prim` resolves the primordials surface from one of two locations:

1. A sibling socket-lib checkout: `../socket-lib/src/primordials.ts`
   (used during fleet development).
2. The installed `@socketsecurity/lib/dist/primordials.js` in the
   target's `node_modules`.

Whichever it finds first wins.

## Design

- **Parser**: vendored acorn-wasm at `<socket-lib>/vendor/acorn-wasm`
  (originally from
  [sdxgen](https://github.com/SocketDev/sdxgen/tree/main/vendor/acorn-wasm))
  — no npm install needed, no network access.
- **Heuristics**: receiver-type guessing for prototype-method calls
  (e.g. `arr.map(...)` → `Array`). False positives show up flagged
  with `[guessed: …]` so they can be dismissed manually.
- **Unambiguous-method map**: methods that exist on exactly one
  built-in type (`.toUpperCase` → String, `.getTime` → Date) are
  classified by the method name regardless of receiver, which is a
  stronger signal than the name heuristic.

## State file format

```json
{
  "updated": "2026-04-22T20:10:19.200Z",
  "targets": {
    "socket-cli": {
      "coverage": [
        { "primordial": "ObjectKeys", "count": 142 },
        { "primordial": "ArrayPrototypeMap", "count": 86 }
      ],
      "gaps": [{ "primordial": "WeakRefPrototypeDeref", "count": 3 }]
    }
  }
}
```

Default location is `<cwd>/.prim-state.json`; override with `--state`.
