# @socketsecurity/lib

[![Socket Badge](https://badge.socket.dev/npm/package/@socketsecurity/lib/7.0.3)](https://badge.socket.dev/npm/package/@socketsecurity/lib/7.0.3)
<picture><img src="https://raw.githubusercontent.com/SocketDev/socket-lib/HEAD/assets/repo/coverage.svg?v=d3f1fd881dda" height="20" alt="Coverage" /></picture>

[![Follow @SocketSecurity](https://raw.githubusercontent.com/SocketDev/socket-lib/HEAD/assets/fleet/badge-follow-x.svg)](https://twitter.com/SocketSecurity)
[![Follow @socket.dev on Bluesky](https://raw.githubusercontent.com/SocketDev/socket-lib/HEAD/assets/fleet/badge-follow-bluesky.svg)](https://bsky.app/profile/socket.dev)

Core utilities for [Socket.dev](https://socket.dev/) tools: file system, processes, HTTP, env detection, logging, spinners, and more. Tree-shakeable, TypeScript-first, cross-platform.

`@socketsecurity/lib` is the shared utility layer for every Socket.dev tool: the CLI, SDK, registry, MCP server, and build infrastructure. It exists so we ship one battle-tested implementation of "spawn a child", "fetch JSON with retries", "delete a path safely on Windows + POSIX", etc. - rather than ten subtly different ones across the fleet. Every export is reachable via a subpath import, so tree-shaking keeps your bundle lean.

## Install

```sh
pnpm add @socketsecurity/lib
```

## Usage

```typescript
import { Spinner } from '@socketsecurity/lib/spinner/spinner'
import { readJson } from '@socketsecurity/lib/fs/read-json'

const spinner = Spinner({ text: 'Loading…' })
spinner.start()
const pkg = await readJson('./package.json')
spinner.successAndStop(`Loaded ${pkg.name}@${pkg.version}`)
```

Every export lives under a subpath - pick what you need:

```typescript
import { spawn } from '@socketsecurity/lib/process/spawn/child'
import { httpJson } from '@socketsecurity/lib/http-request'
import { safeDelete } from '@socketsecurity/lib/fs/safe'
```

Start with the [API reference](./docs/api.md) - every subpath export with a one-line description.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

<br/>

<div align="center">
  <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SocketDev/socket-lib/HEAD/assets/fleet/socket-combomark-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/SocketDev/socket-lib/HEAD/assets/fleet/socket-combomark-light.svg">
      <img width="320" height="91" alt="Socket" src="https://raw.githubusercontent.com/SocketDev/socket-lib/HEAD/assets/fleet/socket-combomark-light.svg">
  </picture>
</div>
