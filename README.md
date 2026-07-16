# @socketsecurity/lib

<a href="https://socket.dev/npm/package/@socketsecurity/lib"><img src="https://socket.dev/api/badge/npm/package/@socketsecurity/lib" alt="Socket Badge" height="20"></a>
![Coverage](assets/repo/badges/coverage.svg)

[![Follow @SocketSecurity](assets/fleet/badge-follow-x.svg)](https://twitter.com/SocketSecurity)
[![Follow @socket.dev on Bluesky](assets/fleet/badge-follow-bluesky.svg)](https://bsky.app/profile/socket.dev)

Core utilities for [Socket.dev](https://socket.dev/) tools: file system, processes, HTTP, env detection, logging, spinners, and more. Tree-shakeable, TypeScript-first, cross-platform.

## Why this repo exists

`@socketsecurity/lib` is the shared utility layer for every Socket.dev tool (the CLI, SDK, registry, MCP server, build infrastructure). It exists so we ship one battle-tested implementation of "spawn a child", "fetch JSON with retries", "delete a path safely on Windows + POSIX", etc. — rather than ten subtly different ones across the fleet. Every export is reachable via a subpath import, so tree-shaking keeps your bundle lean.

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

Every export lives under a subpath — pick what you need:

```typescript
import { spawn } from '@socketsecurity/lib/process/spawn/child'
import { httpJson } from '@socketsecurity/lib/http-request'
import { safeDelete } from '@socketsecurity/lib/fs/safe'
```

Start with the [API reference](./docs/api.md) — every subpath export with a one-line description.

## Development

<details>
<summary>Contributor commands</summary>

```sh
pnpm install          # install
pnpm build            # build
pnpm test             # run tests
pnpm run cover        # tests with coverage
pnpm dev              # watch mode
pnpm run lint         # check style
pnpm run fix          # auto-fix formatting
```

See [CLAUDE.md](./CLAUDE.md) for contributor guidelines.

### Documentation map

- [Getting Started](./docs/getting-started.md) – install + first examples
- [Visual Effects](./docs/visual-effects.md) – spinners, loggers, themes
- [File System](./docs/file-system.md) – files, globs, paths, safe deletion
- [HTTP Utilities](./docs/http-utilities.md) – requests, downloads, retries
- [Process Utilities](./docs/process-utilities.md) – spawn, IPC, locks
- [Package Management](./docs/package-management.md) – npm/pnpm/yarn detection
- [Environment](./docs/environment.md) – CI/platform detection, env getters
- [Constants](./docs/constants.md) – Node versions, npm URLs, platform values
- [Examples](./docs/examples.md) – real-world patterns
- [Troubleshooting](./docs/troubleshooting.md) – common issues

</details>

## License

MIT
