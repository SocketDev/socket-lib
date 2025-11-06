# @socketsecurity/lib

[![Socket Badge](https://socket.dev/api/badge/npm/package/@socketsecurity/lib)](https://socket.dev/npm/package/@socketsecurity/lib)
[![CI](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml)
![Test Coverage](https://img.shields.io/badge/test--coverage-100%25-brightgreen)
![Type Coverage](https://img.shields.io/badge/type--coverage-100%25-brightgreen)

[![Follow @SocketSecurity](https://img.shields.io/twitter/follow/SocketSecurity?style=social)](https://twitter.com/SocketSecurity)

**Core infrastructure library for Socket.dev security tools** — utilities, constants, and helpers with zero dependencies.

## Quick Start

```bash
pnpm add @socketsecurity/lib
```

```typescript
// Import what you need - tree-shakeable exports
import { Spinner } from '@socketsecurity/lib/spinner'
import { readJsonFile } from '@socketsecurity/lib/fs'
import { NODE_MODULES } from '@socketsecurity/lib/constants/packages'

const spinner = Spinner({ text: 'Loading...' })
spinner.start()
const pkg = await readJsonFile('./package.json')
spinner.stop()
```

## 📦 What's Inside

```
@socketsecurity/lib
├── Visual Effects       → 5 themes, spinners, shimmer, logger
├── File System          → fs, paths, globs, temp files
├── Package Management   → 11 utilities (npm, pnpm, yarn, dlx)
├── Process & Spawn      → Safe process spawning, IPC
├── Environment          → 22 modules with 68 typed env getters
├── Constants            → 14 modules (Node.js, npm, platform)
├── Utilities            → Arrays, objects, strings, promises
└── Types                → Full TypeScript definitions
```

## 💡 Key Features

### Visual Effects

**Themed spinners and text effects:**

```typescript
import { Spinner, setTheme } from '@socketsecurity/lib'

setTheme('ultra')  // 🌈 Rainbow shimmer!
const spinner = Spinner({ text: 'Processing...' })
spinner.start()
```

**5 Built-in Themes:** `socket` (violet) · `sunset` (twilight) · `terracotta` (warm) · `lush` (steel blue) · `ultra` (rainbow)

### File System

**Safe, typed file operations:**

```typescript
import { readJsonFile, writeJsonFile } from '@socketsecurity/lib/fs'

const pkg = await readJsonFile<PackageJson>('./package.json')
await writeJsonFile('./output.json', { data: pkg })
```

### Package Management

**Parse and validate package specs:**

```typescript
import { parsePackageSpec } from '@socketsecurity/lib/packages'

const spec = parsePackageSpec('lodash@^4.17.0')
// { name: 'lodash', version: '^4.17.0', type: 'range', ... }
```

### Environment Variables

**68 typed environment getters:**

```typescript
import { getCI } from '@socketsecurity/lib/env/ci'
import { getHome } from '@socketsecurity/lib/env/home'
import { getNodeEnv } from '@socketsecurity/lib/env/node-env'

if (getCI()) {
  console.log('Running in CI')
}
```

### Constants

**Access platform and Node.js constants:**

```typescript
import {
  NODE_MODULES,
  PACKAGE_JSON,
  NPM_REGISTRY_URL,
} from '@socketsecurity/lib/constants/packages'

import { DARWIN, WIN32 } from '@socketsecurity/lib/constants/platform'
```

## Common Patterns

### Spinner with Progress

```typescript
import { withSpinner, Spinner } from '@socketsecurity/lib/spinner'

await withSpinner({
  message: 'Installing packages...',
  spinner: Spinner({ color: [140, 82, 255] }),
  operation: async () => {
    await installPackages()
  }
})
```

### Safe Process Spawning

```typescript
import { spawn } from '@socketsecurity/lib/spawn'

const result = await spawn('npm', ['install'], {
  cwd: '/path/to/project',
  timeout: 30000
})
```

### JSON File Operations

```typescript
import { readJsonFile, writeJsonFile } from '@socketsecurity/lib/fs'

const data = await readJsonFile('./config.json')
data.version = '2.0.0'
await writeJsonFile('./config.json', data)
```

### Promise Utilities

```typescript
import { timeout, retry } from '@socketsecurity/lib/promises'

// Timeout after 5 seconds
const result = await timeout(fetchData(), 5000)

// Retry up to 3 times
const data = await retry(() => fetchData(), { maxAttempts: 3 })
```

## Development

**Quick commands:**
```bash
pnpm install         # Install dependencies
pnpm run dev         # Watch mode
pnpm test            # Run tests
pnpm run fix         # Auto-fix issues
```

## License

MIT
