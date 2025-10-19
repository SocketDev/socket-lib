# @socketsecurity/lib

[![Socket Badge](https://socket.dev/api/badge/npm/package/@socketsecurity/lib)](https://socket.dev/npm/package/@socketsecurity/lib)
[![CI - SocketDev/socket-lib](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml)

[![Follow @SocketSecurity](https://img.shields.io/twitter/follow/SocketSecurity?style=social)](https://twitter.com/SocketSecurity)
[![Follow @socket.dev on Bluesky](https://img.shields.io/badge/Follow-@socket.dev-1DA1F2?style=social&logo=bluesky)](https://bsky.app/profile/socket.dev)

> Core utilities, constants, and helper functions for Socket.dev security tools.

## Installation

```bash
pnpm install @socketsecurity/lib
```

## Features

- **Constants** — Access Node.js, npm, and package manager constants
- **Type Definitions** — Full TypeScript support with comprehensive type exports
- **Helper Utilities** — File system, path, package, and process utilities
- **Environment Variables** — Typed access to environment variables
- **Effects** — Visual effects for CLI applications

## Usage

### Constants

Import Node.js and package manager constants:

```typescript
import {
  NODE_MODULES,
  PACKAGE_JSON,
  PNPM_LOCK_YAML,
  NPM_REGISTRY_URL,
} from '@socketsecurity/lib/constants/packages'
```

### Environment Variables

Access typed environment variables:

```typescript
import { getEnv } from '@socketsecurity/lib/env/getters'
import { NODE_ENV } from '@socketsecurity/lib/env/node-env'

const env = getEnv('NODE_ENV')
console.log(NODE_ENV) // 'production' | 'development' | 'test'
```

For a complete list of available modules, see the [package.json exports](./package.json).

## Type Definitions

All types are exported for TypeScript projects:

```typescript
import type {
  PackageJson,
  TsConfig,
  LockFile,
} from '@socketsecurity/lib/types'
```

## Utilities

Access utility modules for common operations:

```typescript
// File system utilities
import { readJsonFile, writeJsonFile } from '@socketsecurity/lib/fs'

// Package utilities
import { parsePackageSpec } from '@socketsecurity/lib/packages'

// Path utilities
import { normalizePath } from '@socketsecurity/lib/paths'

// And many more...
```

See the [exports map](./package.json) for all available utility modules.

## License

MIT
