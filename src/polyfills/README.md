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

## Iterator helpers take the iterator first

The eleven `Iterator.prototype` helpers, `Iterator.from`, and `Iterator.concat`
are shimmed as free functions whose first argument is the iterator:
`iteratorMap(iter, fn)`, not `iter.map(fn)`. On Node 18 there is no method on
the prototype to call, so a method-shaped shim would have nowhere to live
without patching a global, which this package does not do.

Three of them are not here, and the reason is the same in each case - a shim
would be inventing behavior rather than filling a gap:

- `chunks`, `windows`, `join`, and `includes` are proposals no Node ships.
- `Iterator.prototype[Symbol.dispose]` is `version_added: false` for Node in
  upstream compat data.

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

## Observable behavior is the whole contract

A shim matches what the spec says a caller can **observe**. It does not
reimplement the spec's internal machinery for its own sake.

The distinction decides real questions. `Set.prototype.union` is defined over a
`GetSetRecord` abstraction, so the letter of the spec says to read `size`, then
`has`, then `keys` off the argument in that order and cache them. What a caller
can observe is narrower: which elements the result holds, the order they are in,
which argument shapes throw a `TypeError`, and that a `Set`-like with its own
`has` is honored. A shim that gets all of that right is correct even if it never
builds a record.

Getting that boundary wrong in either direction costs something. `set.mts`
looked finished with a plain, readable implementation, and test262 rejected 38
of its 186 tests: the result was built with `Set.prototype.add` (observable to
anyone who patches it), the receiver was read with `for…of` rather than a
primordial (so a subclass's overrides ran), `next` was fetched once per loop
turn rather than once (observable as extra property gets), and `isSubsetOf`
iterated a snapshot where the spec iterates live (so a set-like whose `has`
deletes from the receiver got the wrong answer). None of those are internal
bookkeeping, and none were visible from reading the code.

So the rule is: match the observable surface exactly, and take any liberty
behind it.

- **Observable, so it is a requirement:** the result's contents and iteration
  order, whether the input is mutated, `undefined` sorted last, the result's
  prototype (`Object.groupBy` returns a null-prototype object), whether a hole
  stays a hole, which errors throw and when relative to other side effects,
  how many times a callback runs and with which arguments.
- **Not observable, so it is free:** the internal record or list the spec
  allocates, the order of steps a caller cannot detect, and the algorithm used
  to get the same answer.

The risk in that freedom is calling something unobservable when it is not, which
is why the claim is tested rather than asserted.

## test262 is what enforces it

`tc39/test262` is the conformance suite for exactly this contract, so the shims
run against it rather than against hand-written assertions alone.

- The corpus is pinned as a shallow, sparse submodule at
  `upstream/test262`, holding only `harness/` plus the `test/built-ins/`
  subtrees these shims implement.
- `pnpm run test262` runs a **subset**: the runner maps each polyfill to its
  test262 directories and runs only those, with the shim installed OVER the
  native method so the suite exercises the shim rather than the engine.
- Hand-written unit tests stay: they cover the native/shim selection and the
  three-export shape, which are this package's contract rather than the
  language's.

## Floors come from compat data

The Node major each feature landed in is read from
`@mdn/browser-compat-data`, not from a comment claiming it was checked. A test
asserts the recorded floor still matches upstream, so a wrong number fails a run
rather than waiting to throw on somebody's machine.
