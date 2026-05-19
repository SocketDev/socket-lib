# opengrep

Resolver for **OpenGrep** — a community fork of semgrep used by
socket-basics for SAST.

## Why it's here

semgrep upstream went license-changed and pricey; OpenGrep keeps the open
toolchain alive. We pin a known-good OpenGrep across the fleet so SAST
results are reproducible.

## API at a glance

```ts
import { resolveOpengrep } from '@socketsecurity/lib/external-tools/opengrep/resolve'

const og = await resolveOpengrep({
  downloadIfMissing: {
    version: '1.0.0',
    platformArch: 'linux-amd64',
  },
})
// → { path, source } | undefined
```

## Tiers (in order)

1. **VFS** — bundled inside smol Node.
2. **PATH** — `which opengrep`.
3. **Download** — GitHub release (opt-in). Mac/Linux: bare binary. Windows:
   zip wrapper.

## When you'd reach for this

- socket-basics SAST scan.
- Anywhere we'd otherwise want to invoke semgrep directly.

## See also

[`../README.md`](../README.md) for the four-tier pattern.
