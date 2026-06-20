# hook-bundle

Faster warm dispatch for import-safe fleet hooks via a CJS rolldown bundle plus a V8 compile-cache loader. Hook sources stay `.mts`.

## Layout

- `scripts/fleet/make-hook-dispatch.mts` is the maker. It scans `.claude/hooks/fleet/` for hooks that are both import-safe (entrypoint-guarded) and export a `run(payload)` entry, then writes `.claude/hooks/fleet/_dispatch/dispatch-table.mts`. That file is a STATIC table of `path` to `thunk` (one static `import()` per hook) that rolldown can see and bundle. A dynamic `import(path.join(HOOKS_DIR, rel))` can't be statically bundled, so the static table is what makes the dispatcher bundle-able.
- `scripts/fleet/build-hook-bundle.mts` plus `.config/repo/rolldown/hook-bundle.config.mts` is the build. Rolldown bundles the dispatcher, the generated table, every referenced hook, `_shared/`, and only the used slices of `@socketsecurity/lib-stable` into `.claude/hooks/fleet/_dispatch/bundle.cjs`. Output is CJS format, minified, with no source maps and no `.d.ts`, tree-shaken, and heavy unreachable lib subgraphs stubbed via `createLibStubPlugin`.
- `.claude/hooks/fleet/_dispatch/index.cjs` is the hand-written thin loader (plain CJS, NOT bundled). It calls `require('node:module').enableCompileCache(<repo>/node_modules/.cache/fleet-hooks)` then `require('./bundle.cjs')`, forwarding the event arg (`process.argv[2]`).
- `.claude/hooks/fleet/_dispatch/dispatch.mts` is the dispatcher. It reads the event arg and stdin once, runs the trigger pre-flight, looks up the matching hooks in the static table, and runs each hook's exported `run(payload)` with early-exit on the first blocking decision.

## Why CJS, not type-stripped `.mts`

V8's compile cache (`module.enableCompileCache`) reliably caches and auto-flushes plain CJS modules on normal process exit. A type-stripped `.mts` dispatcher did NOT auto-flush. A normal exit left ZERO cache files on disk, so every spawn recompiled from scratch. Emitting a plain CJS bundle is the core rationale. The loader stays CJS, the bundle is CJS, and the compile cache actually persists between spawns.

## What the bundle does and does NOT speed up

Most of a cold hook spawn (~1s) is Node STARTUP (process create plus runtime init), with an idle baseline near 100ms. That is fixed cost the bundle and cache cannot touch. The compile cache only removes module-COMPILE time on warm spawns. The real process-count win comes from collapsing many per-hook `node` spawns into one dispatcher spawn per event. The bundle plus cache is the secondary compile-time win on top. Do not overclaim a blanket "Nx faster hook" number.

## Bundled-set scope (gated seam)

Only hooks that are entrypoint-guarded (`import.meta.url` matches `process.argv[1]`) and export a `run(payload)` are eligible. Importing them must not fire `main()` and must not call `process.exit()`, which would tear down the shared dispatcher for every hook. The maker skips the rest. The dispatch path is wired in but NOT yet repointed in `settings.json`. The per-hook `node .../index.mts` invocations still run unchanged, so the bundle is an additive, opt-in fast path until every targeted hook is converted. This is the disabled-seam pattern: the wire-in point is present and tested, the cutover is gated off.

## Staleness reminder

`bundle-stale-reminder` (PostToolUse, Edit|Write) fires after an edit to the dispatcher, the dispatch table, a bundled hook source, or `_shared/`, and reminds you to rebuild. It never blocks. Rebuild with:

```sh
node scripts/fleet/build-hook-bundle.mts
```

The bypass phrase is registered in `docs/agents.md/fleet/bypass-phrases.md` under the `hook-bundle-current` row (the canonical-phrase grammar).

## Proving the compile cache

`test/unit/fleet/hook-bundle-compile-cache.test.mts` (vitest) builds the bundle, spawns the `.cjs` loader for an event, then asserts the compile-cache dir is populated under `<cache>/<v8-version>/` (cache files greater than 0). Without that file count the cache claim is unproven, so the test is the gate on the whole feature.
