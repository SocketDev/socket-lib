# polyfills

Spec shims for built-ins newer than Node 18, the floor this package's consumers
are expected to run.

## The three-export shape

Every feature here exports the same trio, because collapsing them loses
information a caller sometimes needs:

| Export         | What it is                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `<name>Native` | The primordial, captured before any user code can patch it. `undefined` when the running engine lacks the feature. |
| `<name>Shim`   | The in-language implementation, written against the spec text.                                                     |
| `<name>`       | `<name>Native ?? <name>Shim`, which is what a caller normally wants.                                               |

The native and the shim stay separately reachable on purpose:

- A caller that must know whether it got the real thing compares against
  `<name>Native`, so "did this run natively?" is answerable rather than a guess.
- A test suite on an engine that already ships the feature can still exercise
  the shim branch. Without a separate export that branch is unreachable, so it
  ships untested and rots.
- The primordial is read at module load, so a later monkey-patch of the global
  cannot change what this package uses.

`errors/predicates.mts` already followed this shape for `Error.isError`, with
`ErrorIsError` captured in `primordials/error.mts`; these modules match it.

## What belongs here

A built-in a **pure-JS shim can actually implement**. Anything needing engine
support does not, because a shim that silently behaves differently is worse than
an absent one:

- `ArrayBuffer.resize`, `ArrayBuffer.transfer`, `ArrayBuffer.detached`
- `Float16Array`
- every `Intl.*` addition, whose behavior is ICU data rather than JavaScript
- the RegExp `v` flag
- `SharedArrayBuffer.grow`
- symbols as `WeakMap` and `WeakSet` keys

## Floors come from compat data

The Node major each feature landed in is read from
`@mdn/browser-compat-data`, not from a comment claiming it was checked. A test
asserts the recorded floor still matches upstream, so a wrong number fails a run
rather than waiting to throw on somebody's machine.
