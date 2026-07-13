# external-tools

Resolvers for **external binary tools** that Socket products call out to —
JREs, Bazel, Trivy, TruffleHog, cdxgen, and friends. Each tool gets its own
subdirectory exposing a `resolveX()` entry point that figures out where the
tool lives on this machine and hands back a typed pointer.

## Why this module exists

Socket products run on three kinds of hosts:

1. **Stock Node**: the user installed our CLI from npm; nothing is bundled.
2. **smol Node**: our SEA binary with a VFS payload carrying pre-staged tools.
3. **CI**: a container with some tools on `PATH` and others missing.

Every consumer used to hand-roll its own "find java" / "find bazel" code,
and got the precedence wrong in subtle ways (e.g. preferring `PATH` over the
bundled VFS copy, causing version drift). This module centralizes the search
order so every tool resolution behaves consistently.

## The four-tier resolution order

Every resolver tries each source in order and returns the first that hits.
The lowercase token in parentheses is the value of `source` on the returned
`Resolved<Tool>` object — useful for telemetry and conditional logic.

1. **VFS** (`'vfs'`) — bundled inside the smol Node binary's SEA payload.
   Always wins when present; the bytes were sealed at build time. _Not all
   tools have a VFS tier_ — Bazel skips it because the right version is
   per-project (driven by `.bazelversion`), and a bundled global pin would
   always be wrong for someone.
2. **Environment pointer** (`'java-home'` for JRE only) — `JAVA_HOME`-style
   env var pointing at a manually-installed copy. Only the JRE has one.
3. **PATH** (`'path'`) — `which <tool>` on the system PATH. Cheapest non-VFS
   tier; covers most CI containers.
4. **Download** (`'download'`) — fetch from upstream (GitHub release or
   official mirror). Opt-in: the caller passes `downloadIfMissing` to
   `resolveX()`. Without it, the resolver stops at PATH and returns
   `undefined` if nothing matches.

If every tier misses, `resolveX()` resolves to `undefined`. There are no
throws on "not found" — finding the absence is a valid outcome.

## Subdir anatomy

Every tool's directory holds the same five-file template:

| File               | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `types.ts`         | `ResolvedX` shape + `XSource` union                                               |
| `asset-names.ts`   | Per-platform release asset map + URL builder                                      |
| `from-vfs.ts`      | Tier 1 — extracts from smol binary's VFS                                          |
| `from-path.ts`     | Tier 3 — `which <tool>`                                                           |
| `from-download.ts` | Tier 4 — GitHub release fetch (per-tool wrapper around shared `from-download.ts`) |
| `resolve.ts`       | Orchestrator: tries tiers in order, memoizes per option shape                     |

The JRE adds `from-java-home.ts` (tier 2) and `detect-platform-arch.ts`.
Bazel adds `read-bazel-version-file.ts` + `resolve-asset-url.ts` +
`resolve-bazel-version.ts` for `.bazelversion` lookup.

## Shared helpers

- **`from-download.ts`** (this directory) — `downloadToolArchive()` and
  `downloadAndExtractTool()`. Every per-tool `from-download.ts` is a thin
  wrapper around these. Returns `integrity` (SRI `sha512-<base64>`) on every
  call for trust-on-first-use pinning.
- **`manifest.ts`** — reader for `external-tools.json` (Socket's
  hand-maintained pin file). Used by CI workflows + sync scaffolding; the
  per-tool resolvers don't read it directly — callers pick which version/
  integrity to pass into `downloadIfMissing`.
- **`ResolvedToolIntegrity`** type — the canonical doc for the `integrity?`
  field that appears on every `Resolved<Tool>`. Lives in `from-download.ts`
  to keep the contract in one place.

## Memoization

`resolveX()` memoizes by **option shape**. Calling with no options and then
again with `downloadIfMissing` produces two distinct cache entries, so the
second call can fall through to the download tier even if the first
returned `undefined`. The cache is a process-lifetime Map; call
`resetXResolution()` to clear it (used by tests).

## When to add a new tool

If a Socket product needs to shell out to a binary that isn't here yet:

1. Copy any existing subdir (uv is a clean recent example) and rename.
2. Wire the asset names in `asset-names.ts` — point at the upstream release.
3. Decide whether VFS makes sense (project-pinned tools generally don't).
4. Add an entry to `external-tools.json` in each consuming repo.
5. Add a package.json export for each new source file (one export per file
   — the build's tree-shake-friendly default).
6. Write a `README.md` following the template in any sibling subdir.

## See also

- `dlx/binary-download` — the actual download + integrity-verify primitive.
- `archives/extract` — the post-download untar/unzip step.
- `smol/vfs` — the SEA VFS binding (`getSmolVfs()`).
