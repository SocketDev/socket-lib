# uv

Resolver for **uv** — Astral's Rust-built Python package manager. Used by
socket-basics to bootstrap Python projects for scanning.

## Why it's here

`uv` replaced `pip` + `pip-tools` + `virtualenv` + `pyenv` in our scanning
pipelines because it's an order of magnitude faster on cold caches and
ships a single static binary per platform. We pin one version across the
fleet so resolver results are reproducible.

## API at a glance

```ts
import { resolveUv } from '@socketsecurity/lib/external-tools/uv/resolve'

const uv = await resolveUv({
  downloadIfMissing: {
    version: '0.5.13',
    platformArch: 'aarch64-apple-darwin',
  },
})
// → { path, source } | undefined
```

## Tiers (in order)

1. **VFS** — bundled inside smol Node.
2. **PATH** — `which uv`.
3. **Download** — GitHub release tarball (opt-in). The release archive wraps
   the binary one level deep — the per-tool `from-download.ts` handles the
   strip.

## When you'd reach for this

- Bootstrapping a Python venv for scanning (`uv venv`, `uv pip install`).
- Anywhere a Socket workflow needs Python deps resolved fast.

## See also

[`../README.md`](../README.md) for the four-tier pattern.
