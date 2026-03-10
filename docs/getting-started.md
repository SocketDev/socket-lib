# Getting Started with @socketsecurity/lib

Welcome to @socketsecurity/lib, the core infrastructure library for Socket.dev security tools. This guide will help you get up and running quickly.

## Prerequisites

**Node.js Version:** Node.js 22 or higher is required.

You can check your Node.js version with:
```bash
node --version
```

If you need to upgrade, visit [nodejs.org](https://nodejs.org) to download the latest version.

**Why Node.js 22+?** This library takes advantage of modern JavaScript features and Node.js APIs that are only available in recent versions. Using Node.js 22+ ensures you have access to the latest performance improvements and security features.

## Installation

Install the library using pnpm (recommended), npm, or yarn:

```bash
# Using pnpm (recommended)
pnpm add @socketsecurity/lib

# Using npm
npm install @socketsecurity/lib

# Using yarn
yarn add @socketsecurity/lib
```

## Your First Example

Let's create a simple script that uses a few core features:

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'
import { getDefaultLogger } from '@socketsecurity/lib/logger'
import { readJson } from '@socketsecurity/lib/fs'

// Create a logger instance
const logger = getDefaultLogger()

// Create and start a spinner
const spinner = Spinner({ text: 'Loading package.json...' })
spinner.start()

// Read and parse a JSON file
const pkg = await readJson('./package.json')

// Stop the spinner and show success
spinner.successAndStop('Loaded successfully')

// Log the package name
logger.success(`Package name: ${pkg.name}`)
```

Save this as `example.ts` and run it:
```bash
npx tsx example.ts
```

You should see an animated spinner followed by success messages.

## Understanding Tree-Shakeable Exports

This library uses **tree-shakeable exports**, which means you import exactly what you need:

```typescript
// Good: Import only what you need
import { Spinner } from '@socketsecurity/lib/spinner'
import { readJson } from '@socketsecurity/lib/fs'

// Avoid: Don't import from the root
// import { Spinner, readJson } from '@socketsecurity/lib'
```

This approach keeps your bundle size small by only including the code you actually use.

## Common Use Cases

### Working with Files

```typescript
import { readFileUtf8, writeJson, safeDelete } from '@socketsecurity/lib/fs'

// Read a text file
const content = await readFileUtf8('./README.md')

// Write JSON with formatting
await writeJson('./config.json', { version: '1.0.0' }, { spaces: 2 })

// Safely delete files (with protection against deleting important directories)
await safeDelete('./temp-dir')
```

### Spawning Processes

```typescript
import { spawn } from '@socketsecurity/lib/spawn'

// Run a command and get the output
const result = await spawn('git', ['status'])
console.log(result.stdout)

// Run with options
const result = await spawn('npm', ['install'], {
  cwd: '/path/to/project',
  stdio: 'pipe'
})
```

### Environment Detection

```typescript
import { getCI } from '@socketsecurity/lib/env/ci'
import { getNodeEnv } from '@socketsecurity/lib/env/node-env'

if (getCI()) {
  console.log('Running in CI environment')
}

if (getNodeEnv() === 'production') {
  console.log('Production mode')
}
```

### HTTP Requests

```typescript
import { httpJson, httpDownload } from '@socketsecurity/lib/http-request'

// Fetch JSON from an API
const data = await httpJson('https://api.example.com/data')

// Download a file
await httpDownload(
  'https://example.com/file.zip',
  '/tmp/file.zip',
  {
    onProgress: (downloaded, total) => {
      console.log(`${(downloaded / total * 100).toFixed(1)}% complete`)
    }
  }
)
```

### Logging with Symbols

```typescript
import { getDefaultLogger } from '@socketsecurity/lib/logger'

const logger = getDefaultLogger()

logger.success('Build completed successfully')
logger.fail('Tests failed')
logger.warn('Deprecated API used')
logger.info('Starting process')
logger.step('Building application')
logger.substep('Compiling TypeScript')
```

## What's Included

@socketsecurity/lib provides utilities in these categories:

- **Visual Effects**: Spinners, loggers, themes, progress indicators
- **File System**: Reading/writing files, globs, safe deletion, path utilities
- **HTTP**: JSON/text requests, file downloads, retry logic
- **Process Management**: Spawning processes, IPC, locks
- **Environment**: CI detection, environment variable getters
- **Package Management**: npm/pnpm/yarn operations, manifest parsing
- **Constants**: Node versions, npm URLs, platform values
- **Utilities**: Arrays, objects, strings, promises, sorting

## Next Steps

Ready to dive deeper? Check out these guides:

- [File System Operations](./file-system.md) - Working with files, directories, and paths
- [Visual Effects](./visual-effects.md) - Spinners, loggers, and progress indicators
- [HTTP Utilities](./http-utilities.md) - Making requests and downloading files
- [Process Utilities](./process-utilities.md) - Spawning and managing child processes
- [Environment Detection](./environment.md) - Detecting CI, Node.js environment, and more
- [Examples](./examples.md) - Real-world usage patterns
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## Getting Help

If you run into issues:

1. Check the [Troubleshooting Guide](./troubleshooting.md)
2. Review the API documentation for your specific feature
3. Look at the [Examples](./examples.md) for similar use cases
4. Check the [GitHub issues](https://github.com/SocketDev/socket-lib/issues)
