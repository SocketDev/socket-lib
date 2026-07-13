# socket-lib/temporal

> Clean-room re-implementation of the TC39 Temporal proposal (Stage 4),
> annotated line-by-line against the spec.

## What's here

| File          | Spec clause                                | Purpose                                                             |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `temporal.ts` | —                                          | Public aggregator. `import * as Temporal from …`                    |
| `slots.ts`    | —                                          | Internal-slot machinery via `WeakMap` / `WeakSet`. Shared.          |
| `system.ts`   | 21.x SystemUTCEpochNanoseconds (host hook) | Real-nanosecond wallclock reader.                                   |
| `now.ts`      | 6 Temporal.Now                             | Namespace object. Pass 1 ships `now.instant()`.                     |
| `instant.ts`  | 8 Temporal.Instant                         | Class + constructor. Statics + prototype operations land in pass 2. |

Future additions land as new top-level files (`plain-date.ts`,
`duration.ts`, `zoned-date-time.ts`, …), not subfolders. The spec
already provides the hierarchy via clause numbering; mirroring the
spec's flat clause layout keeps reviewer navigation mechanical.

## Why this folder exists

Three things drive this rewrite instead of using the standard library
or the `@js-temporal/polyfill` package directly:

- **Native Temporal isn't reliably available.** Node 26.x ships it
  behind `--experimental-temporal-api`; conformance has bugs that
  shift between flag-bumps. A clean wrapper hides that variance, but
  also hides correctness bugs we'd inherit. We re-implement so the
  surface we use is the surface we own.
- **Polyfill as runtime dep adds an attack surface we don't need.**
  socket-lib's whole point is being a minimal-dep base layer. Adding
  `@js-temporal/polyfill` would put a multi-thousand-line dep on the
  hot path of every Socket consumer for the four operations Socket
  actually uses (`Now.instant`, `Instant.from`, `Instant.fromEpochMs`,
  `Instant.prototype.epochMilliseconds`).
- **`new Date()` is unsafe at scale.** Mutable, locale-dependent
  serialization, `Date.parse` accepts garbage, no real nanosecond
  precision. We've hit this enough times across Socket repos that
  centralizing the replacement is worth the upfront cost.

## When to add to this folder

You're writing code that needs a timestamp, duration, or wallclock
read. **Use these helpers, not `new Date(…)` / `Date.now()` /
`Date.parse(…)`** — those forms are guarded by an oxlint rule.

When you reach for `Temporal.<Namespace>.<op>` and the operation
doesn't exist yet here, add it deliberately (see the recipe below);
don't fall back to the equivalent `Date` form.

## Adding a new operation

1. **Find the spec section** in the pinned rev (see _Spec revision
   pinning_ below). Each operation has a section number like `8.4.2`.
2. **Decide which file it lives in** — same clause as an existing
   file, or a new top-level file if it's a new namespace. We group
   one file per spec clause.
3. **Write the JSDoc header** citing the section number, the spec URL,
   and the algorithm steps verbatim. The header is the contract; the
   body implements it.
4. **Walk the steps with `// Step N.` comments** at each
   implementation point. Match v8's `runtime-temporal.cc` density —
   every spec step gets a corresponding line.
5. **Throws use primordials.** `RangeErrorCtor` / `TypeErrorCtor` /
   `ErrorCtor` from `../primordials/error`, never the bare globals.
6. **Throw messages follow Socket's four-ingredient rule** (What /
   Where / Saw / Fix). The spec only says "throw a `RangeError`"; we
   pick the message. See `../../docs/agents.md/fleet/error-messages.md`.
7. **Internal slot reads/writes** go through `slots.ts` — never store
   state on `this.<field>` directly. The spec models slots as private,
   non-introspectable storage; the `WeakMap`-based helpers preserve
   that contract.
8. **Static methods, prototype methods, and abstract operations** live
   inline within the clause's file, separated by section-header
   comment dividers. The class constructor file is also where
   prototype methods are wired via `Object.defineProperty` at module
   load.
9. **Update the surface inventory at the top of the clause file** to
   list the operation as ✓ (with section number) rather than ✗.
10. **Add a test** that round-trips through the polyfill reference
    impl's relevant `test262` cases — those are the ground truth.

## The spec-step annotation style

This is what an operation looks like end-to-end (excerpt from
`instant.ts`):

```ts
/**
 * 8.4.2 Temporal.Instant.from ( item )
 * https://tc39.es/proposal-temporal/#sec-temporal.instant.from
 *
 * 1. If Type(item) is Object and item has an [[InitializedTemporalInstant]]
 *    internal slot, then
 *    a. Return ! CreateTemporalInstant(item.[[Nanoseconds]]).
 * 2. Return ? ToTemporalInstant(item).
 */
export function from(item: unknown): Instant {
  // Step 1.
  if (typeof item === 'object' && item !== null && hasInstantSlot(item)) {
    // Step 1.a.
    return new Instant(getNanoseconds(item))
  }
  // Step 2.
  return toTemporalInstant(item)
}
```

The header cites the section and lists the spec steps as written. The
body matches step-for-step with inline `// Step N.` markers. A
reviewer reads the spec PDF on one side and the file on the other and
the two move together.

## Error guidance

The Temporal spec says many places: _"throw a RangeError exception"_
or _"throw a TypeError exception"_. The spec is silent on the message
text. Our throws use the **primordial** constructor and follow the
Socket's **four-ingredient** message rule.

**✓**:

```ts
throw new RangeErrorCtor(
  `Temporal.Instant.from: expected ISO 8601 instant with time and offset; ` +
    `saw ${JSON.stringify(input)}. Example: '2026-05-14T12:00:00Z'.`,
)
```

Rule (`expected ISO 8601 instant with time and offset`),
where (`Temporal.Instant.from`), saw (the input value),
fix (`Example: '...'`).

**✗**:

```ts
throw new RangeError('invalid input')
```

No rule, no where, no saw, no fix. Also: bare global `RangeError`
instead of the primordial — fails the primordials lint.

Full rule and worked examples:
[`../../docs/agents.md/fleet/error-messages.md`](../../docs/agents.md/fleet/error-messages.md).

## Spec revision pinning

We pin **two** SHAs:

- **Spec:** [`tc39/proposal-temporal@4df4199adbb012e7c4005ca23bed1a898d29c87c`](https://github.com/tc39/proposal-temporal/commit/4df4199adbb012e7c4005ca23bed1a898d29c87c)
  (2026-05-11). Algorithmic source of truth. Annotations cite section
  numbers against this exact rev.
- **Reference impl:** [`js-temporal/temporal-polyfill@52dcc4ca1281d4b89d537040a3983357d305a399`](https://github.com/js-temporal/temporal-polyfill/commit/52dcc4ca1281d4b89d537040a3983357d305a399)
  (2026-04-22, local working tree at `../../../../temporal-polyfill`
  branch `rebase-part3`). Read alongside the spec to disambiguate
  underspecified edge cases.

Temporal reached Stage 4 in 2025. The spec is stable; tc39/proposal-
temporal hasn't tagged a Stage-4 release, so the SHA pin is
load-bearing. When updating the pin:

1. Read the spec diff section-by-section against our annotated files.
2. Renumber sections in JSDoc headers if any clause moved.
3. Update the polyfill SHA in lockstep when behavior diverges.

## Internal slots and the WeakMap trick

The spec treats Temporal objects as having non-introspectable internal
slots (`[[InitializedTemporalInstant]]`, `[[Nanoseconds]]`, etc.).
ECMAScript private fields (`#nanoseconds`) are close but not quite the
same — they don't survive `Object.create(Instant.prototype)` and they
leak through `Reflect.ownKeys` patterns.

We use a per-slot `WeakMap` (or `WeakSet` for boolean presence) keyed
on the receiver. `instanceof Instant` is **not** the slot-presence
check — the spec separates "is a Temporal.Instant" from "has the
initialized slot." `slots.ts` exposes:

- `hasInstantSlot(o)` — slot-presence predicate
- `setInstantSlots(o, ns)` — install slots
- `getNanoseconds(o)` — read `[[Nanoseconds]]`

This matches the polyfill's approach and survives subclassing as the
spec requires.

## When a test262 runner lands here

The Socket convention for test262-corpus runners (today: socket-btm,
ultrathink acorn) is:

- Runner library lives at `test/scripts/test262-<scope>-runner.mts`.
- Runner is import-safe: any `main()` is guarded with `if (import.meta.main)`.
- All pure helpers (classifiers, frontmatter parsers, allowlist loaders)
  live in the **same file** as the runner — no `*-helpers.mts` /
  `*-classify.mts` siblings. Section-header comments inside the runner
  separate concerns.
- The unit test lives at `test/unit/test262-<scope>.test.mts`, imports
  the pure helpers directly from the runner, and runs under vitest
  (no hand-rolled `run()` / counters / `process.exit` driver).

When pass-2 (or later) of this folder's surface grows enough to warrant
test262 conformance, the runner goes at
`test/scripts/test262-temporal-runner.mts` and the test at
`test/unit/test262-temporal.test.mts`. See
`socket-btm/packages/temporal-infra/test/` for the canonical layout.

## Why no native fast path (yet)

We do **not** detect `globalThis.Temporal` and delegate to it. Reasons:

- **Conformance is uneven.** Node 26.x has known bugs in the flagged
  implementation; checking `typeof Temporal !== 'undefined'` would
  silently use a buggy impl on some hosts.
- **Annotations diverge.** Our spec-step annotations describe our
  code. A native fast path means the annotated code doesn't run in
  production, weakening the audit value of the annotations.
- **Socket's Temporal usage isn't hot.** Roughly 50 timestamp
  operations per script run. Native perf wins are dwarfed by the
  network calls those scripts make.

When a hot-path consumer materializes (a metrics aggregator, a request
hot path), the path forward is: whitelist specific Node versions known
to be conformant, gate at module load, fall back to our impl
otherwise. Document the version whitelist in this README at that
time.
