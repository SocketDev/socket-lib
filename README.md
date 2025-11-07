# @socketsecurity/lib

[![Socket Badge](https://socket.dev/api/badge/npm/package/@socketsecurity/lib)](https://socket.dev/npm/package/@socketsecurity/lib)
[![CI](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml)
![Test Coverage](https://img.shields.io/badge/test--coverage-68.17%25-yellow)
![Type Coverage](https://img.shields.io/badge/type--coverage-97.68%25-brightgreen)

[![Follow @SocketSecurity](https://img.shields.io/twitter/follow/SocketSecurity?style=social)](https://twitter.com/SocketSecurity)

Core library for Socket.dev tools.

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

- **Visual Effects** → Spinners, themes, logger
- **File System** → fs, paths, globs
- **Package Management** → npm, pnpm, yarn, dlx
- **Process & Spawn** → Safe process spawning
- **Environment** → 68 typed env getters
- **Constants** → Node.js, npm, platform
- **Utilities** → Arrays, objects, strings, promises

## Development

```bash
pnpm install    # Install
pnpm build      # Build
pnpm test       # Test
pnpm dev        # Watch mode
```

## License

MIT
