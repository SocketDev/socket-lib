# Naming style

How socket-lib names its exports. Internal: most rules are about the cost of
ambiguity at the call site, not about saving characters at the import.

## Core rule: no ambiguous names

**Every exported function name must read clearly at its call site without
relying on the import path for context.**

The module path is invisible at the call site. A reader looking at one line
of code shouldn't have to scroll to the import block to understand what
`read(...)` reads.

```ts
// NO — what is being read?
import { read, write, del } from '@socketsecurity/lib/secrets/keychain'
read({ service, account })          // 200 LOC later: which read?

// YES — call site stands alone
import { readSecret, writeSecret, deleteSecret } from '@socketsecurity/lib/secrets/keychain'
readSecret({ service, account })    // obvious
```

Node's stdlib follows the same rule: `fs.writeFileSync`, not `fs.writeSync`.
The `file` survives even though `fs` is the namespace.

### When to strip the noun

Only when the resulting name is still self-describing:

- **Constructors / factories** — `Spinner()`, not `createSpinner()`. The noun
  IS the thing being made.
- **Domain-specific verbs** — `stringify` in `json/`, not `toString`. The
  verb is uniquely meaningful in JSON-land.
- **Direct mirror of a stdlib API** — `paths/resolve.ts` exports `resolve`
  and `relative` to match `node:path.resolve()` / `path.relative()`. The
  mental model is "this is `path`, but ours."

## Verb-first for actions

For functions that DO things:

```
parseJson      not  jsonParse
parseJsonSafe  not  safeJsonParse
toEditablePackageJson  not  pkgJsonToEditable
```

The verb tells the reader the *kind* of operation; the noun says *what* it
operates on.

## Plural matches the underlying type

When wrapping a class or noun, match its plurality:

```
urlSearchParamsAsArray   not  urlSearchParamAsArray  // matches URLSearchParams
```

## Internal helpers: drop `get` prefix on probes

Internal `getNativeHash()` → `nativeHash()`. The `get` prefix is noise on a
private memoizing-probe; the bare noun reads as "give me the native hash
function."

This is **internal** only — public API still uses `get` where it disambiguates
(e.g. `getDefaultLogger()` returns a singleton).

## Private vs public files

Within a module:

- `_internal.ts` — underscore-prefix, NOT part of public API. The dist export
  generator skips `dist/**/_*` so consumers can't import these even if they
  guess the path.
- Flat siblings (`macos.ts`, `linux.ts`, `windows.ts`, `keychain.ts`, `rc.ts`)
  — these ARE the public surface. Each filename declares its primary export.

## Pairs: async + sync

When both shapes exist, the async is the canonical name and sync gets a
suffix:

```
readSecret      / readSecretSync
writeSecret     / writeSecretSync
parseJson       / (no sync variant — it's already sync)
```

Don't invert this (`readSecretAsync` is wrong — async is the default).

## Types co-located with primary function

`SpinnerOptions`, `ParseJsonOptions`, `WriteOptions` live in the same module
as `Spinner` / `parseJson` / `writeSecret`. The `Options` suffix is
load-bearing: it signals "config for the function with the same prefix."

Type for an instance shape gets `Instance` suffix when there's a name
collision with a factory:

```
function Spinner(opts): SpinnerInstance     // factory and instance both named Spinner before
```

## Variables in code

Local variables follow normal JS conventions (camelCase, descriptive). The
strict rules above apply only to **exported** names.

## When in doubt

Read the call site out loud. If a reasonable reader needs to look up the
import to understand it, the name is wrong.
