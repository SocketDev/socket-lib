# `socket-keychain` resolver

This resolver installs the local credential bridge used by AI tools, repository
hooks, Agent-CI, and other developer-box automation. Callers use the binary to
request one named credential without reading a plaintext `.env` file or placing
the secret in argv.

The resolver requires three values from Wheelhouse's external-tools manifest:

- an exact release version;
- the current `platform-arch` name;
- a SHA-256 or SRI integrity pin for that asset.

It downloads the matching GitHub Release asset, checks the bytes against the
pin, and copies the executable to
`<wheelhouse>/rack/socket-keychain/<version>/<platform-arch>/`. The installed
file uses owner-only permissions.

## Why it does not search `PATH`

A normal developer tool can prefer an executable that already exists on
`PATH`. A credential reader needs a stricter rule. A malicious program named
`socket-keychain` earlier on `PATH` could capture secret output or imitate a
permission prompt. This resolver uses the checksum-pinned binary in the shared
Wheelhouse rack and returns its absolute path.

## Use

```ts
const keychain = await resolveSocketKeychain({
  version: manifest.version,
  platformArch,
  integrity: manifest.integrity,
})

// Pass keychain.path directly to the child-process API. Do not resolve it
// through a shell.
```

The resolver installs the executable. The caller still owns credential naming,
the permission-prompt deadline, child-process environment cleanup, and error
messages for a missing entry.
