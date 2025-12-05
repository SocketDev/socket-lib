# @socketsecurity/lib

[![Socket Badge](https://socket.dev/api/badge/npm/package/@socketsecurity/lib)](https://socket.dev/npm/package/@socketsecurity/lib)
[![CI](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml)
![Coverage](https://img.shields.io/badge/coverage-84.10%25-brightgreen)

[![Follow @SocketSecurity](https://img.shields.io/twitter/follow/SocketSecurity?style=social)](https://twitter.com/SocketSecurity)
[![Follow @socket.dev on Bluesky](https://img.shields.io/badge/Follow-@socket.dev-1DA1F2?style=social&logo=bluesky)](https://bsky.app/profile/socket.dev)

Core library for [Socket.dev](https://socket.dev/) tools.

## Install

```bash
pnpm add @socketsecurity/lib
```

## Usage

```typescript
// Tree-shakeable exports
import { Spinner } from '@socketsecurity/lib/spinner'
import { readJsonFile } from '@socketsecurity/lib/fs'
import { NODE_MODULES } from '@socketsecurity/lib/constants/packages'

const spinner = Spinner({ text: 'Loading...' })
spinner.start()
const pkg = await readJsonFile('./package.json')
spinner.stop()
```

## What's Inside

- **Visual Effects** → logger, spinner, themes
- **File System** → fs, globs, paths
- **Package Management** → dlx, npm, pnpm, yarn
- **Process & Spawn** → process spawning
- **Environment** → env getters
- **Constants** → node, npm, platform
- **Utilities** → arrays, objects, promises, strings

## Development

```bash
pnpm install    # Install
pnpm build      # Build
pnpm test       # Test
pnpm dev        # Watch mode
```

## License

MIT
