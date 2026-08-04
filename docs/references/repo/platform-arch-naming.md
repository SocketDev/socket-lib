# Platform-arch naming

`getPlatformArch()` builds the `<os>-<arch>[-<libc>]` identifier used for
directory names and release-asset names. The format is short, but each choice
in it was made to avoid a translation step somewhere else, so this note records
the reasoning.

## The format

The OS segment is `process.platform` verbatim (`darwin` / `linux` / `win32`),
and the arch segment is `process.arch` verbatim (`x64` / `arm64`). The libc
suffix is `-musl`, Linux only, and glibc is left unsuffixed.

## Why `win32` and not `win`

`win32` is what `process.platform` returns on every Windows host. An npm
package whose install-time platform filter uses the standard `os` / `cpu` /
`libc` manifest fields has to match those strings exactly, because npm compares
them verbatim with no shorthand layer.

Using `win` internally would force a translation every time we built an install
filter or a target triple, and a reviewer would have to remember that we
abbreviate on disk but not in package filters. Matching means there is no
translation step available to get wrong.

pnpm's pack-app (v11+) accepts `<os>-<arch>[-<libc>]` target strings, and its
shards are `@pnpm/exe.<os>-<arch>` — also with `win32`, see pnpm#11314. Our
names therefore flow straight into pack-app's `--target` argument,
`pnpm.app.targets` config, and sibling-package-name construction.

## Why `-musl` is the suffix and glibc is bare

Node.js's own linuxstatic tarballs used the unqualified `linux` for glibc and a
separate download channel for musl. The pnpm ecosystem codified that as
`linux-<arch>` for glibc and `linux-<arch>-musl` for the outlier.

That asymmetry matches the real distribution of Linux systems: glibc is the
majority case and musl is Alpine and similar. Adding `-glibc` to the default
would be redundant noise in every name.

## Why libc is Linux-only

macOS and Windows have exactly one system libc each, Apple's libSystem and
Microsoft's UCRT. A name like `darwin-arm64-libsystem` carries no information.
Node.js, npm, and pnpm all treat libc as a Linux-only axis, so following the
same convention keeps callers from writing special-case prefix matches.

## Why this is a function rather than an inline join

Two upstream APIs need this exact triple: the npm manifest filter
(`os`/`cpu`/`libc`) and pnpm's pack-app `--target`. Building it in one place
means a future schema change, say Node adding `riscv64`, is a single edit, and
the unsupported-platform error reads the same from downloaders, pack-app
invocations, and the `@socketbin/*` resolver.
