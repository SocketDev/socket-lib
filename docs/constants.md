# Constants

Pre-defined constant values for Node.js versions, npm registry URLs, platform detection, and process information.

## When to Use Constants

- Checking Node.js version requirements
- Building npm registry URLs
- Platform-specific logic
- Process information access

## Quick Start

```typescript
import { MIN_SUPPORTED_NODE_VERSION } from '@socketsecurity/lib/constants/node'
import { MAIN_REGISTRY_URL } from '@socketsecurity/lib/constants/npm'

if (process.version < `v${MIN_SUPPORTED_NODE_VERSION}`) {
  console.error(`Node.js ${MIN_SUPPORTED_NODE_VERSION}+ required`)
  process.exit(1)
}

console.log(`Registry: ${MAIN_REGISTRY_URL}`)
```

## Node.js Constants

### MIN_SUPPORTED_NODE_VERSION

Minimum supported Node.js version for Socket.dev tools.

```typescript
import { MIN_SUPPORTED_NODE_VERSION } from '@socketsecurity/lib/constants/node'

console.log(MIN_SUPPORTED_NODE_VERSION) // "22.0.0"
```

### Version Checking

```typescript
import { MIN_SUPPORTED_NODE_VERSION } from '@socketsecurity/lib/constants/node'

const currentVersion = process.version.slice(1) // Remove 'v' prefix

if (currentVersion < MIN_SUPPORTED_NODE_VERSION) {
  throw new Error(
    `Node.js ${MIN_SUPPORTED_NODE_VERSION}+ required. Current: ${currentVersion}`
  )
}
```

## npm Registry Constants

### MAIN_REGISTRY_URL

The main npm registry URL.

```typescript
import { MAIN_REGISTRY_URL } from '@socketsecurity/lib/constants/npm'

console.log(MAIN_REGISTRY_URL) // "https://registry.npmjs.org"
```

### Building Registry URLs

```typescript
import { MAIN_REGISTRY_URL } from '@socketsecurity/lib/constants/npm'
import { httpJson } from '@socketsecurity/lib/http-request'

// Get package metadata
const packageName = 'lodash'
const url = `${MAIN_REGISTRY_URL}/${packageName}`
const metadata = await httpJson(url)

console.log(metadata.name, metadata['dist-tags'].latest)
```

### Package Tarball URLs

```typescript
import { MAIN_REGISTRY_URL } from '@socketsecurity/lib/constants/npm'

function getTarballUrl(name: string, version: string): string {
  return `${MAIN_REGISTRY_URL}/${name}/-/${name}-${version}.tgz`
}

const url = getTarballUrl('lodash', '4.17.21')
// "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"
```

## Platform Constants

### WIN32

Checks if platform is Windows.

```typescript
import { WIN32 } from '@socketsecurity/lib/constants/platform'

if (WIN32) {
  console.log('Running on Windows')
  // Use Windows-specific logic
}
```

### DARWIN

Checks if platform is macOS.

```typescript
import { DARWIN } from '@socketsecurity/lib/constants/platform'

if (DARWIN) {
  console.log('Running on macOS')
  // Use macOS-specific logic
}
```

### LINUX

Checks if platform is Linux.

```typescript
import { LINUX } from '@socketsecurity/lib/constants/platform'

if (LINUX) {
  console.log('Running on Linux')
  // Use Linux-specific logic
}
```

### Platform-Specific Logic Example

```typescript
import { WIN32, DARWIN, LINUX } from '@socketsecurity/lib/constants/platform'
import { getHome, getUserProfile } from '@socketsecurity/lib/env'
import path from 'node:path'

function getConfigDir(): string {
  const home = getHome() || getUserProfile()
  if (!home) {
    throw new Error('Cannot determine home directory')
  }

  if (WIN32) {
    return path.join(home, 'AppData', 'Local', 'MyApp')
  } else if (DARWIN) {
    return path.join(home, 'Library', 'Application Support', 'MyApp')
  } else if (LINUX) {
    return path.join(home, '.config', 'myapp')
  }

  return path.join(home, '.myapp')
}
```

## Process Constants

### getAbortSignal()

Gets the global abort signal for canceling operations.

```typescript
import { getAbortSignal } from '@socketsecurity/lib/constants/process'

const signal = getAbortSignal()

// Use with HTTP requests
const response = await httpRequest(url, { signal })

// Use with file operations
const content = await readFile(path, { signal })

// Use with spawn
await spawn('command', [], { signal })
```

**What it does:** Returns a global AbortSignal that can be used to cancel async operations.

**When to use:** When you want to provide a cancellation mechanism for long-running operations.

## Real-World Examples

### Version Requirement Checker

```typescript
import { MIN_SUPPORTED_NODE_VERSION } from '@socketsecurity/lib/constants/node'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

function checkNodeVersion() {
  const logger = getDefaultLogger()
  const current = process.version.slice(1) // Remove 'v'
  const required = MIN_SUPPORTED_NODE_VERSION

  const [currentMajor] = current.split('.').map(Number)
  const [requiredMajor] = required.split('.').map(Number)

  if (currentMajor < requiredMajor) {
    logger.fail(`Node.js ${required}+ is required`)
    logger.error(`Current version: ${current}`)
    logger.info(`Download from: https://nodejs.org`)
    process.exit(1)
  }

  logger.success(`Node.js ${current} (supported)`)
}

checkNodeVersion()
```

### npm Package Downloader

```typescript
import { MAIN_REGISTRY_URL } from '@socketsecurity/lib/constants/npm'
import { httpJson, httpDownload } from '@socketsecurity/lib/http-request'
import { Spinner } from '@socketsecurity/lib/spinner'

interface PackageMetadata {
  'dist-tags': { latest: string }
  versions: Record<string, {
    dist: { tarball: string }
  }>
}

async function downloadPackage(
  name: string,
  version: string,
  destDir: string
) {
  const spinner = Spinner()

  // Get package metadata
  spinner.start('Fetching package metadata...')
  const metadata = await httpJson<PackageMetadata>(
    `${MAIN_REGISTRY_URL}/${name}`
  )
  spinner.success('Metadata fetched')

  // Use 'latest' if version not specified
  const targetVersion = version === 'latest'
    ? metadata['dist-tags'].latest
    : version

  const versionData = metadata.versions[targetVersion]
  if (!versionData) {
    spinner.failAndStop(`Version ${targetVersion} not found`)
    throw new Error(`Version not found: ${targetVersion}`)
  }

  // Download tarball
  spinner.start(`Downloading ${name}@${targetVersion}...`)
  const tarballUrl = versionData.dist.tarball
  const destPath = `${destDir}/${name}-${targetVersion}.tgz`

  await httpDownload(tarballUrl, destPath, {
    onProgress: (downloaded, total) => {
      spinner.progress(downloaded, total, 'bytes')
    }
  })

  spinner.successAndStop(`Downloaded to ${destPath}`)
}

await downloadPackage('lodash', 'latest', '/tmp')
```

### Cross-Platform Path Builder

```typescript
import { WIN32, DARWIN, LINUX } from '@socketsecurity/lib/constants/platform'
import path from 'node:path'

class PathBuilder {
  private segments: string[] = []

  constructor(private base: string) {
    this.segments.push(base)
  }

  static home(): PathBuilder {
    const home = process.env.HOME || process.env.USERPROFILE
    if (!home) {
      throw new Error('Cannot determine home directory')
    }
    return new PathBuilder(home)
  }

  appData(appName: string): this {
    if (WIN32) {
      this.segments.push('AppData', 'Local', appName)
    } else if (DARWIN) {
      this.segments.push('Library', 'Application Support', appName)
    } else {
      this.segments.push('.config', appName)
    }
    return this
  }

  add(...parts: string[]): this {
    this.segments.push(...parts)
    return this
  }

  build(): string {
    return path.join(...this.segments)
  }
}

// Usage
const configPath = PathBuilder.home()
  .appData('MyApp')
  .add('config.json')
  .build()

console.log(configPath)
// Windows: C:\Users\name\AppData\Local\MyApp\config.json
// macOS: /Users/name/Library/Application Support/MyApp/config.json
// Linux: /home/name/.config/MyApp/config.json
```

### Registry URL Builder

```typescript
import { MAIN_REGISTRY_URL } from '@socketsecurity/lib/constants/npm'

class RegistryClient {
  constructor(private baseUrl: string = MAIN_REGISTRY_URL) {}

  packageUrl(name: string): string {
    return `${this.baseUrl}/${name}`
  }

  versionUrl(name: string, version: string): string {
    return `${this.baseUrl}/${name}/${version}`
  }

  tarballUrl(name: string, version: string): string {
    const scope = name.startsWith('@') ? name.split('/')[0] : null
    const pkgName = scope ? name.split('/')[1] : name

    if (scope) {
      return `${this.baseUrl}/${name}/-/${pkgName}-${version}.tgz`
    }

    return `${this.baseUrl}/${name}/-/${name}-${version}.tgz`
  }

  searchUrl(text: string): string {
    return `${this.baseUrl}/-/v1/search?text=${encodeURIComponent(text)}`
  }
}

// Usage
const registry = new RegistryClient()
console.log(registry.packageUrl('lodash'))
console.log(registry.tarballUrl('@types/node', '20.0.0'))
console.log(registry.searchUrl('testing framework'))
```

### Abort Signal Usage

```typescript
import { getAbortSignal } from '@socketsecurity/lib/constants/process'
import { httpDownload } from '@socketsecurity/lib/http-request'
import { spawn } from '@socketsecurity/lib/spawn'

const signal = getAbortSignal()

// Set up signal handler
process.on('SIGINT', () => {
  console.log('Cancelling operations...')
  // Abort signal will cancel all operations using it
})

// All these operations respect the abort signal
await Promise.all([
  httpDownload('https://example.com/file1.zip', '/tmp/file1.zip', {
    signal
  }),
  httpDownload('https://example.com/file2.zip', '/tmp/file2.zip', {
    signal
  }),
  spawn('long-running-command', [], { signal })
])
```

## Available Constants

### Node.js
- `MIN_SUPPORTED_NODE_VERSION` - Minimum Node.js version ("22.0.0")

### npm Registry
- `MAIN_REGISTRY_URL` - Main npm registry ("https://registry.npmjs.org")

### Platform
- `WIN32` - Boolean, true on Windows
- `DARWIN` - Boolean, true on macOS
- `LINUX` - Boolean, true on Linux

### Process
- `getAbortSignal()` - Function returning global AbortSignal

## Troubleshooting

### Platform detection incorrect

**Problem:** Platform constants don't match expected OS.

**Solution:**
Check `process.platform` directly:
```typescript
console.log(process.platform)
// 'win32', 'darwin', 'linux', etc.
```

### Node version check fails incorrectly

**Problem:** Version requirement check fails when it shouldn't.

**Solution:**
Use proper version comparison:
```typescript
import semver from 'semver'
import { MIN_SUPPORTED_NODE_VERSION } from '@socketsecurity/lib/constants/node'

if (!semver.gte(process.version, MIN_SUPPORTED_NODE_VERSION)) {
  console.error('Node.js version too old')
}
```

### Registry URL doesn't work

**Problem:** Custom registry URL needed.

**Solution:**
Use environment variable or config:
```typescript
const registryUrl = process.env.NPM_REGISTRY || MAIN_REGISTRY_URL
```
