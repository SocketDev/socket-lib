# jre

Resolver for the **Java Runtime Environment** — the JVM Socket needs to drive
Bazel, SBT, and a handful of upstream Java tools (`ws.exe`, etc.).

## Why it's here

Java is the heaviest external dependency we ship. We can't assume the host has
a JRE installed, and the version matters — Bazel and SBT both pin minimum JVM
versions. This resolver covers four discovery paths so we don't have to
hard-code a search routine into every consumer.

## API at a glance

```ts
import { resolveJre } from '@socketsecurity/lib/external-tools/jre/resolve'

const jre = await resolveJre()
// → { javaPath, javaHome, source } | undefined

const dl = await resolveJre({
  downloadIfMissing: {
    version: '21',
    platformArch: 'darwin-arm64',
    integrity: 'sha512-…', // optional; trust-on-first-use otherwise
  },
})
```

The returned `source` is `'vfs' | 'java-home' | 'path' | 'download'` so callers
can log which tier hit.

## Tiers (in order)

1. **VFS** — embedded JRE inside the smol Node binary.
2. **`JAVA_HOME`** — if the env var points at a directory with `bin/java`.
3. **PATH** — `which java`.
4. **Download** — Adoptium release (opt-in via `downloadIfMissing`).

## When you'd reach for this

- Anywhere we shell out to a `.jar` or a JVM-launcher script.
- Specifically: `resolveBazel()` and `resolveSbt()` both call `resolveJre()`
  to discover the JVM they need.

## Subdir extras

- `detect-platform-arch.ts` — turns `process.platform` + `process.arch` into
  the Adoptium token (`mac-aarch64`, `linux-x64`, etc.).
- `from-java-home.ts` — the tier-2 helper unique to JRE.

## See also

[`../README.md`](../README.md) for the four-tier pattern shared across tools.
