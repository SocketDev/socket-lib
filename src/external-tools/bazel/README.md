# bazel

Resolver for **Bazel** — Google's build system used by socket-btm and a
handful of upstream projects we scan.

## Why it's here

Bazel's version is _per-project_: every repo pins one via `.bazelversion`,
and the wrong version usually fails to load the WORKSPACE. We can't bundle
"a Bazel" globally; we have to download the one the project asked for.

## API at a glance

```ts
import { resolveBazel } from '@socketsecurity/lib/external-tools/bazel/resolve'

// Local discovery only.
const local = await resolveBazel()

// With download fallback (pass version from `.bazelversion`).
const dl = await resolveBazel({
  downloadIfMissing: {
    version: '7.4.1',
    platformArch: 'darwin-arm64',
  },
})
```

## Tiers (in order)

1. **PATH** — `bazelisk` is preferred (handles per-project version
   switching), then plain `bazel`.
2. **Download** — upstream GitHub release binary (opt-in).

**No VFS tier.** Bundling a global Bazel into the smol binary would lock
every project to one version — the opposite of what `.bazelversion` exists
for.

## When you'd reach for this

- Build orchestration for socket-btm (`temporal-infra/` is Bazel-driven).
- Any scanning workflow that needs to run an upstream's `bazel build` to
  produce inputs.

## Subdir extras

- `read-bazel-version-file.ts` — parses a project's `.bazelversion` file.
- `resolve-bazel-version.ts` — picks the version using `.bazelversion`
  with fallbacks.
- `resolve-asset-url.ts` — turns version + platform-arch into the GitHub
  release asset URL.

## See also

[`../README.md`](../README.md) for the four-tier pattern.
