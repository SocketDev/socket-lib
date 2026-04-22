# @socketsecurity/lib

[![Socket Badge](https://socket.dev/api/badge/npm/package/@socketsecurity/lib)](https://socket.dev/npm/package/@socketsecurity/lib)
[![CI](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml)
![Coverage](https://img.shields.io/badge/coverage-81%25-brightgreen)

[![Follow @SocketSecurity](https://img.shields.io/twitter/follow/SocketSecurity?style=social)](https://twitter.com/SocketSecurity)
[![Follow @socket.dev on Bluesky](https://img.shields.io/badge/Follow-@socket.dev-1DA1F2?style=social&logo=bluesky)](https://bsky.app/profile/socket.dev)

Core utilities for [Socket.dev](https://socket.dev/) tools: file system, processes, HTTP, env detection, logging, spinners, and more. Tree-shakeable, TypeScript-first, cross-platform.

## Install

```bash
pnpm add @socketsecurity/lib
```

## Quick Start

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'
import { readJson } from '@socketsecurity/lib/fs'

const spinner = Spinner({ text: 'Loading…' })
spinner.start()
const pkg = await readJson('./package.json')
spinner.successAndStop(`Loaded ${pkg.name}@${pkg.version}`)
```

Every export lives under a subpath — pick what you need:

```typescript
import { spawn } from '@socketsecurity/lib/spawn'
import { httpJson } from '@socketsecurity/lib/http-request'
import { safeDelete } from '@socketsecurity/lib/fs'
```

## Documentation

Start with the [API Index](./docs/api-index.md) — every subpath export with a one-line description.

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

## Development

```bash
pnpm install          # install
pnpm build            # build
pnpm test             # run tests
pnpm run cover        # tests with coverage
pnpm dev              # watch mode
pnpm run lint         # check style
pnpm run fix          # auto-fix formatting
```

See [CLAUDE.md](./CLAUDE.md) for contributor guidelines.

## License

MIT
