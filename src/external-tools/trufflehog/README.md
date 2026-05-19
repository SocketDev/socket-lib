# trufflehog

Resolver for **TruffleHog** — TruffleSecurity's single-binary secrets scanner.
socket-basics uses it for the SAST secrets-scan workflow.

## Why it's here

TruffleHog ships a single Go-compiled binary per platform — nice and simple,
but every consumer used to download it themselves. Centralizing lets us
share the VFS-bundled copy in smol Node and re-use one cached download
across runs.

## API at a glance

```ts
import { resolveTrufflehog } from '@socketsecurity/lib/external-tools/trufflehog/resolve'

const th = await resolveTrufflehog({
  downloadIfMissing: {
    version: '3.81.10',
    platformArch: 'linux-amd64',
  },
})
// → { path, source } | undefined
```

## Tiers (in order)

1. **VFS** — bundled inside smol Node.
2. **PATH** — `which trufflehog`.
3. **Download** — GitHub release tarball (opt-in).

## When you'd reach for this

- socket-basics SAST secrets scan.
- Anywhere we need to grep for high-entropy credentials in a checkout.

## See also

[`../README.md`](../README.md) for the four-tier pattern.
