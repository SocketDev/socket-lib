# synp

Resolver for **synp** — converts `package-lock.json` ↔ `yarn.lock`. Used by
Socket workflows that need to normalize between lockfile flavors before
SCA processing.

## Why it's here

synp is small and npm-only — there's no upstream binary release. We resolve
it via the `dlx/package` pipeline (`pkg:npm/synp@1.9.14`) so it lives in the
shared dlx cache instead of being installed per-project.

## API at a glance

```ts
import { resolveSynp } from '@socketsecurity/lib/external-tools/synp/resolve'

const synp = await resolveSynp({
  downloadIfMissing: {
    version: '1.9.14',
    // synp is npm-only; no platformArch needed.
  },
})
// → { path, source } | undefined
```

## Tiers (in order)

1. **VFS** — bundled inside smol Node.
2. **PATH** — `which synp`.
3. **Download** — npm via `dlx/package` (opt-in).

## When you'd reach for this

- Converting a `package-lock.json` to a `yarn.lock` before feeding it to a
  Yarn-only analyzer.
- The reverse direction for a npm-only analyzer.

## Caveats

- **No trust-on-first-use integrity surface.** synp comes from npm via
  `dlx/package`, which verifies against a pre-pinned `hash` option but
  doesn't return the computed hash. The `Resolved<Synp>` `integrity` field
  will always be `undefined`, even when `source === 'download'`.

## See also

[`../README.md`](../README.md) for the four-tier pattern.
