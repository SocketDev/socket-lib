# sbt

Resolver for the **SBT launcher** — Scala Build Tool's `sbt-launch.jar`. SBT
itself is a `.jar`; running it requires a JVM.

## Why it's here

We resolve SBT separately from the JRE because the launcher and the runtime
are independent: you can have a JRE without `sbt` on PATH (in which case we
extract the bundled launcher), and you can have a system `sbt` script that
manages its own JRE (in which case we skip our JRE entirely).

## API at a glance

```ts
import { resolveSbt } from '@socketsecurity/lib/external-tools/sbt/resolve'

const sbt = await resolveSbt()
// → { path, isJar, source } | undefined
```

If `isJar` is `true`, invoke as `java -jar <path>` using a JRE from
`resolveJre()`. If `false`, the resolved path is a directly-executable shell
script that knows how to find its own JVM.

## Tiers (in order)

1. **VFS** — bundled `sbt-launch.jar` inside the smol Node binary.
2. **PATH** — system `sbt` shell script.
3. **Download** — Maven Central artifact (opt-in).

## When you'd reach for this

- Scanning a Scala project that uses SBT for dependency resolution.
- Anywhere we'd otherwise need to ask the user to install SBT separately.

## See also

- [`../jre/README.md`](../jre/README.md) — required for the `isJar` case.
- [`../README.md`](../README.md) for the four-tier pattern.
