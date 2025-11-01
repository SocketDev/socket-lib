# @socketsecurity/lib

[![Socket Badge](https://socket.dev/api/badge/npm/package/@socketsecurity/lib)](https://socket.dev/npm/package/@socketsecurity/lib)
[![CI](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/SocketDev/socket-lib/actions/workflows/ci.yml)
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
├── Visual Effects       → Spinners, shimmer, themes, logger
├── File System          → fs, paths, globs, temp files
├── Package Management   → npm, pnpm, yarn utilities
├── Process & Spawn      → Safe process spawning, IPC
├── Environment          → 68 typed env getters (CI, paths, etc)
├── Constants            → Node.js, npm, platform constants
├── Utilities            → Arrays, objects, strings, promises
└── Types                → Full TypeScript definitions
```

## 💡 Key Features

### Visual Effects

**Themed spinners and text effects:**

```typescript
import { Spinner, setTheme } from '@socketsecurity/lib'

setTheme('ultra')  // 🌈 Rainbow mode!
const spinner = Spinner({ text: 'Processing...' })
spinner.enableShimmer()
spinner.start()
```

**5 Built-in Themes:** `socket` (purple) · `coana` · `socket-firewall` · `socket-cli-python` · `ultra` (rainbow)

👉 [**Theme System Docs**](./docs/themes.md)

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

## Module Organization

**120+ granular exports** organized by category:

```
/constants/        → Node.js, npm, platform constants
  ├─ packages      → PACKAGE_JSON, NODE_MODULES, etc.
  ├─ platform      → DARWIN, WIN32, S_IXUSR, etc.
  ├─ node          → NODE_VERSION, NODE_PATH, etc.
  ├─ time          → MILLISECONDS_PER_*, DLX_BINARY_CACHE_TTL
  └─ encoding      → UTF8, CHAR_* codes

/env/              → 68 typed environment getters
  ├─ ci            → getCI() - Detect CI environment
  ├─ home          → getHome() - User home directory
  ├─ node-env      → getNodeEnv() - NODE_ENV value
  └─ ...           → And 65 more!

/packages/         → Package management utilities
  ├─ validation    → Package name/version validation
  ├─ operations    → Install, extract, manifest
  ├─ registry      → npm registry utilities
  └─ editable      → Editable installs detection

/effects/          → Visual effects for CLI
  ├─ text-shimmer  → Animated gradient text
  ├─ pulse-frames  → Pulsing text effect
  └─ ultra         → Rainbow gradients

/stdio/            → Terminal I/O utilities
  ├─ stdout        → Safe stdout operations
  ├─ stderr        → Safe stderr operations
  ├─ clear         → Clear terminal
  └─ footer        → Terminal footers

/themes/           → Theme system for consistent branding
  ├─ types         → Theme type definitions
  ├─ themes        → 5 built-in themes
  ├─ context       → Global theme management
  └─ utils         → Color resolution, theme creation
```

## Documentation

| Doc | Description |
|-----|-------------|
| [**Getting Started**](./docs/getting-started.md) | Development workflow, commands, architecture |
| [**Theme System**](./docs/themes.md) | Themed spinners, colors, and effects |
| [**Build Architecture**](./docs/build.md) | Vendored dependencies, build system |
| [**CLAUDE.md**](./CLAUDE.md) | Coding standards and patterns |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  @socketsecurity/lib                                │
│  Zero runtime dependencies                          │
├─────────────────────────────────────────────────────┤
│  src/                                               │
│  ├── constants/        14 modules                   │
│  ├── env/              68 getters                   │
│  ├── packages/         12 utilities                 │
│  ├── effects/           4 visual effects            │
│  ├── stdio/             9 I/O utilities             │
│  ├── themes/            Theme system                │
│  ├── external/         40+ vendored deps            │
│  └── ... 60+ more modules                           │
├─────────────────────────────────────────────────────┤
│  Build: esbuild → CommonJS (ES2022)                │
│  Types: tsgo (TypeScript Native Preview)            │
│  Tests: Vitest (4600+ tests, 100% coverage)        │
└─────────────────────────────────────────────────────┘
```

## Development

```bash
# Setup
git clone https://github.com/SocketDev/socket-lib.git
cd socket-lib
pnpm install

# Build
pnpm run build       # Production build
pnpm run dev         # Watch mode

# Test
pnpm test            # Run all tests
pnpm run cover       # With coverage

# Quality
pnpm run check       # Type check
pnpm run lint        # Lint code
pnpm run fix         # Auto-fix issues
```

## Stats

- **183** TypeScript modules
- **120+** granular exports
- **68** typed environment getters
- **14** constant modules
- **4600+** tests passing
- **Zero** runtime dependencies

## Contributing

See [CLAUDE.md](./CLAUDE.md) for:
- Code style and patterns
- Path alias usage
- Testing guidelines
- Build system details

## License

MIT

---

**Built by Socket.dev** — [socket.dev](https://socket.dev) | [@SocketSecurity](https://twitter.com/SocketSecurity)
