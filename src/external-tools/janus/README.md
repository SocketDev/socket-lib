# janus

Resolver for **janus** — a tool from `divmain/janus` used by Socket
workflows. Currently macOS-aarch64 only; the platform map will grow as
upstream adds builds.

## Why it's here

janus is invoked from a handful of automation scripts across the fleet; the
shared `~/.socket/_wheelhouse/janus/` cache means every fleet member resolves
to the same binary instead of each repo downloading its own copy.

## API at a glance

```ts
import { resolveJanus } from '@socketsecurity/lib/external-tools/janus/resolve'

const janus = await resolveJanus({
  downloadIfMissing: {
    version: '0.1.0',
    platformArch: 'darwin-aarch64',
  },
})
// → { path, source } | undefined
```

## Tiers (in order)

1. **VFS** — bundled inside smol Node.
2. **PATH** — `which janus`.
3. **Download** — GitHub release (opt-in). macOS aarch64 only today.

## When you'd reach for this

- Fleet-wide automation steps that compose janus into a pipeline.

## Caveats

- **Platform support is narrow.** Calling `resolveJanus()` with
  `downloadIfMissing` on Linux or Windows will throw at the asset-resolution
  step — there is no build for those platforms upstream yet.

## See also

[`../README.md`](../README.md) for the four-tier pattern.
