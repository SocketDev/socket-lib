# cdxgen

Resolver for **cdxgen** — CycloneDX's SBOM generator. We use it to produce
CycloneDX SBOMs for projects we scan.

## Why it's here

cdxgen historically shipped as an `npm` package (`@cyclonedx/cdxgen`). Since
v12.x it also ships per-platform **SEA binaries** — single-file Node bundles
with no npm install step. We use the SEA binary exclusively: it's faster to
start, has no npm dependency tree to verify, and one cached binary per
machine beats per-project node_modules copies.

The future migration target is socket's own **`sdxgen`** fork once that
lands GA. The helper API stays `resolveCdxgen()` for source compatibility —
the swap will be a one-line change inside this directory.

## API at a glance

```ts
import { resolveCdxgen } from '@socketsecurity/lib/external-tools/cdxgen/resolve'

const cdx = await resolveCdxgen({
  downloadIfMissing: {
    version: '12.4.1',
    platformArch: 'darwin-arm64',
    flavor: 'slim', // 'slim' | 'full'
  },
})
// → { path, source } | undefined
```

## Tiers (in order)

1. **VFS** — bundled inside smol Node.
2. **PATH** — `which cdxgen`.
3. **Download** — GitHub release SEA binary (opt-in). **No npm fallback** —
   single source of truth.

## When you'd reach for this

- Producing a CycloneDX SBOM for a scanned project.
- Anywhere we'd otherwise spawn `npx @cyclonedx/cdxgen`.

## Slim vs full

cdxgen ships two flavors per platform:

- **`slim`** — the language analyzers Socket needs day-to-day. Default for
  everyday use.
- **`full`** — every analyzer including the ones we don't run.

Pick `slim` unless you have a reason — saves ~70MB per cached binary.

## See also

[`../README.md`](../README.md) for the four-tier pattern.
