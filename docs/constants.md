# Constants

Pre-defined constant values for Node.js versions, npm registry URLs, platform detection, and process information.

## When to Use Constants

- Checking Node.js version requirements
- Building npm registry URLs
- Platform-specific logic
- Process information access

## Quick Start

```typescript
import { WIN32, DARWIN } from '@socketsecurity/lib/constants/platform'

if (WIN32) {
  console.log('Running on Windows')
} else if (DARWIN) {
  console.log('Running on macOS')
} else {
  console.log('Running on Linux or other Unix-like OS')
}
```

## Node.js Constants

See `@socketsecurity/lib/constants/node` for Node.js-related constants.

## npm Registry Constants

For building npm registry URLs, use string literals directly:

```typescript
import { httpJson } from '@socketsecurity/lib/http-request'

// Get package metadata from npm registry
const packageName = 'lodash'
const url = `https://registry.npmjs.org/${packageName}`
const metadata = await httpJson(url)

console.log(metadata.name, metadata['dist-tags'].latest)
```

### Package Tarball URLs

```typescript
function getTarballUrl(name: string, version: string): string {
  return `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`
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

### Detecting Linux

There is no `LINUX` constant. To detect Linux or other Unix-like systems, check if the platform is neither Windows nor macOS:

```typescript
import { WIN32, DARWIN } from '@socketsecurity/lib/constants/platform'

const isLinux = !WIN32 && !DARWIN
if (isLinux) {
  console.log('Running on Linux or other Unix-like OS')
  // Use Linux-specific logic
}
```

### Platform-Specific Logic Example

```typescript
import { WIN32, DARWIN } from '@socketsecurity/lib/constants/platform'
import { getHome } from '@socketsecurity/lib/env/home'
import path from 'node:path'

function getConfigDir(): string {
  const home = getHome()
  if (!home) {
    throw new Error('Cannot determine home directory')
  }

  if (WIN32) {
    return path.join(home, 'AppData', 'Local', 'MyApp')
  } else if (DARWIN) {
    return path.join(home, 'Library', 'Application Support', 'MyApp')
  } else {
    // Linux or other Unix-like OS
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
import { getNodeMajorVersion } from '@socketsecurity/lib/constants/node'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

function checkNodeVersion() {
  const logger = getDefaultLogger()
  const requiredMajor = 22 // Node.js 22+ required (from README.md)
  const currentMajor = getNodeMajorVersion()

  if (currentMajor < requiredMajor) {
    logger.fail(`Node.js ${requiredMajor}+ is required`)
    logger.error(`Current version: ${process.version}`)
    logger.info(`Download from: https://nodejs.org`)
    process.exit(1)
  }

  logger.success(`Node.js ${process.version} (supported)`)
}

checkNodeVersion()
```

### npm Package Downloader

```typescript
import { httpJson, httpDownload } from '@socketsecurity/lib/http-request'
import { Spinner } from '@socketsecurity/lib/spinner'

const NPM_REGISTRY = 'https://registry.npmjs.org'

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
    `${NPM_REGISTRY}/${name}`
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
import { WIN32, DARWIN } from '@socketsecurity/lib/constants/platform'
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
class RegistryClient {
  constructor(private baseUrl: string = 'https://registry.npmjs.org') {}

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

### Platform
- `WIN32` - Boolean, true on Windows
- `DARWIN` - Boolean, true on macOS
- For Linux detection, use `!WIN32 && !DARWIN`

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
import { getNodeMajorVersion } from '@socketsecurity/lib/constants/node'

const requiredMajor = 22 // Node.js 22+ required
if (getNodeMajorVersion() < requiredMajor) {
  console.error(`Node.js ${requiredMajor}+ required, current: ${process.version}`)
  process.exit(1)
}
```

### Registry URL doesn't work

**Problem:** Custom registry URL needed.

**Solution:**
Use environment variable or config:
```typescript
const registryUrl = process.env.NPM_REGISTRY || 'https://registry.npmjs.org'
```
