# trivy

Resolver for **Trivy** — Aqua Security's vulnerability + IaC + SBOM scanner.
socket-basics uses it for container and filesystem scanning.

## Why it's here

Trivy is a single Go binary that does a lot — container scanning, IaC misconfig
detection, SBOM generation, secret scanning. We pin one version per Socket
release; this resolver lets every Socket product use the same pinned copy
without each one re-implementing the download dance.

## API at a glance

```ts
import { resolveTrivy } from '@socketsecurity/lib/external-tools/trivy/resolve'

const trivy = await resolveTrivy({
  downloadIfMissing: {
    version: '0.58.1',
    platformArch: 'linux-amd64',
  },
})
// → { path, source } | undefined
```

## Tiers (in order)

1. **VFS** — bundled inside smol Node.
2. **PATH** — `which trivy`.
3. **Download** — GitHub release tarball (opt-in).

## When you'd reach for this

- Container image scanning (`trivy image`).
- IaC misconfig scanning (`trivy config`).
- Filesystem vuln scanning (`trivy fs`).

## See also

[`../README.md`](../README.md) for the four-tier pattern.
