# Real-World Examples

Complete examples showing how to combine multiple utilities from @socketsecurity/lib for common CLI tool patterns.

## CLI Tool with Progress Feedback

A complete CLI tool that downloads a file, processes it, and provides visual feedback:

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'
import { getDefaultLogger } from '@socketsecurity/lib/logger'
import { httpDownload } from '@socketsecurity/lib/http-request'
import { readFileBinary, safeDelete, safeMkdir, safeStats } from '@socketsecurity/lib/fs'
import { spawn } from '@socketsecurity/lib/spawn'

const logger = getDefaultLogger()
const spinner = Spinner()

async function downloadAndProcess(url: string, destPath: string) {
  logger.step('Starting download and processing')

  // Ensure destination directory exists
  await safeMkdir(destPath)

  // Download file with progress
  spinner.start('Downloading file...')
  const downloadPath = `${destPath}/download.tar.gz`

  try {
    await httpDownload(url, downloadPath, {
      onProgress: (downloaded, total) => {
        spinner.progress(downloaded, total, 'bytes')
      }
    })
    spinner.success(`Downloaded ${(await safeStats(downloadPath))?.size || 0} bytes`)
  } catch (error) {
    spinner.failAndStop('Download failed')
    throw error
  }

  // Extract archive
  spinner.text('Extracting archive...')
  await spawn('tar', ['-xzf', downloadPath, '-C', destPath])
  spinner.success('Extracted successfully')

  // Clean up
  spinner.text('Cleaning up...')
  await safeDelete(downloadPath)
  spinner.successAndStop('Processing complete')

  logger.success(`Files extracted to ${destPath}`)
}

// Usage
await downloadAndProcess(
  'https://example.com/archive.tar.gz',
  './output'
)
```

## Package Manager Wrapper

A wrapper that detects and runs the appropriate package manager:

```typescript
import { spawn } from '@socketsecurity/lib/spawn'
import { findUpSync } from '@socketsecurity/lib/fs'
import { getDefaultLogger } from '@socketsecurity/lib/logger'
import { Spinner } from '@socketsecurity/lib/spinner'

async function detectPackageManager(cwd: string): Promise<'npm' | 'pnpm' | 'yarn'> {
  if (findUpSync('pnpm-lock.yaml', { cwd })) return 'pnpm'
  if (findUpSync('yarn.lock', { cwd })) return 'yarn'
  return 'npm'
}

async function installDependencies(projectPath: string) {
  const logger = getDefaultLogger()
  const spinner = Spinner()

  const pm = await detectPackageManager(projectPath)
  logger.info(`Detected package manager: ${pm}`)

  spinner.start(`Installing dependencies with ${pm}...`)

  try {
    await spawn(pm, ['install'], {
      cwd: projectPath,
      stdio: 'pipe',
      spinner
    })

    spinner.successAndStop('Dependencies installed')
  } catch (error) {
    spinner.failAndStop('Installation failed')
    logger.error('Error details:', error)
    throw error
  }
}

// Usage
await installDependencies('./my-project')
```

## Build Pipeline with Error Recovery

A build system that tries multiple strategies on failure:

```typescript
import { spawn } from '@socketsecurity/lib/spawn'
import { Spinner } from '@socketsecurity/lib/spinner'
import { getDefaultLogger } from '@socketsecurity/lib/logger'
import { safeDelete, isDirSync } from '@socketsecurity/lib/fs'

async function buildProject(projectPath: string) {
  const logger = getDefaultLogger()
  const spinner = Spinner()

  // Clean old build
  logger.step('Cleaning previous build')
  if (isDirSync(`${projectPath}/dist`)) {
    await safeDelete(`${projectPath}/dist`)
    logger.success('Cleaned dist directory')
  }

  // Try TypeScript build
  spinner.start('Compiling TypeScript...')
  try {
    await spawn('tsc', ['--noEmit'], {
      cwd: projectPath
    })
    spinner.success('TypeScript check passed')
  } catch (error) {
    spinner.warn('TypeScript check failed, continuing...')
  }

  // Build with esbuild
  spinner.text('Building with esbuild...')
  try {
    await spawn('esbuild', [
      'src/index.ts',
      '--bundle',
      '--platform=node',
      '--outfile=dist/index.js'
    ], {
      cwd: projectPath
    })
    spinner.success('Build successful')
  } catch (error) {
    spinner.failAndStop('Build failed')

    // Try fallback: simple copy
    logger.warn('Trying fallback: copying source files')
    spinner.start('Copying files...')
    await spawn('cp', ['-r', 'src', 'dist'], { cwd: projectPath })
    spinner.warnAndStop('Using fallback: source files copied')
  }

  // Run tests
  spinner.start('Running tests...')
  try {
    await spawn('vitest', ['run'], {
      cwd: projectPath
    })
    spinner.successAndStop('All tests passed')
  } catch (error) {
    spinner.failAndStop('Tests failed')
    throw error
  }

  logger.success('Build pipeline complete')
}

// Usage
await buildProject('./my-project')
```

## Configuration Manager

Load configuration from multiple sources with fallbacks:

```typescript
import { readJson, findUpSync, safeReadFile } from '@socketsecurity/lib/fs'
import { getHome } from '@socketsecurity/lib/env/home'
import { getNodeEnv } from '@socketsecurity/lib/env/node-env'
import path from 'node:path'

interface Config {
  apiUrl: string
  timeout: number
  debug: boolean
}

async function loadConfig(projectDir: string): Promise<Config> {
  const env = getNodeEnv()
  const home = getHome()

  // Default config
  const defaults: Config = {
    apiUrl: 'https://api.example.com',
    timeout: 30000,
    debug: false
  }

  // Try loading configs in order of precedence
  const configs: Partial<Config>[] = [defaults]

  // 1. Global config in home directory
  if (home) {
    const globalConfig = await readJson(
      path.join(home, '.myapp', 'config.json'),
      { throws: false }
    )
    if (globalConfig) {
      configs.push(globalConfig)
    }
  }

  // 2. Project config
  const projectConfig = await readJson(
    path.join(projectDir, '.myapprc'),
    { throws: false }
  )
  if (projectConfig) {
    configs.push(projectConfig)
  }

  // 3. Environment-specific config
  const envConfig = await readJson(
    path.join(projectDir, `.myapprc.${env}`),
    { throws: false }
  )
  if (envConfig) {
    configs.push(envConfig)
  }

  // 4. Environment variables
  const envVars: Partial<Config> = {}
  if (process.env.API_URL) envVars.apiUrl = process.env.API_URL
  if (process.env.TIMEOUT) envVars.timeout = parseInt(process.env.TIMEOUT)
  if (process.env.DEBUG) envVars.debug = process.env.DEBUG === 'true'
  configs.push(envVars)

  // Merge all configs (later ones override earlier ones)
  return Object.assign({}, ...configs) as Config
}

// Usage
const config = await loadConfig(process.cwd())
console.log('Using config:', config)
```

## Parallel File Processor

Process multiple files in parallel with progress tracking:

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'
import { getDefaultLogger } from '@socketsecurity/lib/logger'
import { readDirNames, readFileUtf8, safeMkdir } from '@socketsecurity/lib/fs'
import fs from 'node:fs/promises'
import path from 'node:path'

async function processFiles(inputDir: string, outputDir: string) {
  const logger = getDefaultLogger()
  const spinner = Spinner()

  // Get all subdirectories
  spinner.start('Scanning directories...')
  const dirs = await readDirNames(inputDir)
  spinner.success(`Found ${dirs.length} directories`)

  // Process all files in parallel
  logger.step('Processing files')
  spinner.progress(0, dirs.length, 'directories')

  let processed = 0

  const results = await Promise.all(
    dirs.map(async (dir) => {
      const dirPath = path.join(inputDir, dir)
      const files = await readDirNames(dirPath)

      for (const file of files) {
        const inputPath = path.join(dirPath, file)
        const outputPath = path.join(outputDir, dir, file)

        const content = await readFileUtf8(inputPath)
        const processedContent = content.toUpperCase() // Example processing

        await safeMkdir(path.dirname(outputPath))
        await fs.writeFile(outputPath, processedContent, 'utf8')
      }

      processed++
      spinner.progress(processed, dirs.length, 'directories')

      return { dir, fileCount: files.length }
    })
  )

  spinner.successAndStop('All files processed')

  logger.success(`Processed ${results.reduce((sum, r) => sum + r.fileCount, 0)} files`)
  return results
}

// Usage
await processFiles('./input', './output')
```

## Git Operations Helper

Common git operations with error handling:

```typescript
import { spawn, isSpawnError } from '@socketsecurity/lib/spawn'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

async function gitStatus(repoPath: string) {
  const result = await spawn('git', ['status', '--porcelain'], {
    cwd: repoPath
  })
  return result.stdout.trim()
}

async function hasUncommittedChanges(repoPath: string): Promise<boolean> {
  const status = await gitStatus(repoPath)
  return status.length > 0
}

async function getCurrentBranch(repoPath: string): Promise<string> {
  const result = await spawn('git', ['branch', '--show-current'], {
    cwd: repoPath
  })
  return result.stdout.trim()
}

async function safeCheckout(repoPath: string, branch: string) {
  const logger = getDefaultLogger()

  // Check for uncommitted changes
  if (await hasUncommittedChanges(repoPath)) {
    logger.warn('You have uncommitted changes')

    // Offer to stash
    logger.step('Stashing changes')
    await spawn('git', ['stash', 'push', '-m', 'Auto-stash before checkout'], {
      cwd: repoPath
    })
    logger.success('Changes stashed')
  }

  // Checkout branch
  logger.step(`Checking out ${branch}`)
  try {
    await spawn('git', ['checkout', branch], {
      cwd: repoPath
    })
    logger.success(`Switched to ${branch}`)
  } catch (error) {
    if (isSpawnError(error)) {
      logger.fail(`Failed to checkout ${branch}`)
      logger.error(error.stderr)
    }
    throw error
  }
}

// Usage
const branch = await getCurrentBranch('./my-repo')
console.log(`Current branch: ${branch}`)

if (await hasUncommittedChanges('./my-repo')) {
  console.log('You have uncommitted changes')
}

await safeCheckout('./my-repo', 'main')
```

## Health Check System

Monitor multiple services with retries:

```typescript
import { httpJson } from '@socketsecurity/lib/http-request'
import { getDefaultLogger } from '@socketsecurity/lib/logger'
import { Spinner } from '@socketsecurity/lib/spinner'

interface HealthCheck {
  name: string
  url: string
  expectedStatus?: number
}

async function checkHealth(checks: HealthCheck[]) {
  const logger = getDefaultLogger()
  const spinner = Spinner()

  logger.step('Running health checks')

  const results = await Promise.all(
    checks.map(async (check) => {
      spinner.start(`Checking ${check.name}...`)

      try {
        const response = await httpJson(check.url, {
          retries: 3,
          retryDelay: 1000,
          timeout: 5000
        })

        spinner.success(`${check.name}: OK`)
        return { ...check, status: 'healthy', data: response }
      } catch (error) {
        spinner.fail(`${check.name}: FAILED`)
        return { ...check, status: 'unhealthy', error }
      }
    })
  )

  spinner.stop()

  const healthyCount = results.filter(r => r.status === 'healthy').length
  const totalCount = results.length

  if (healthyCount === totalCount) {
    logger.success(`All ${totalCount} services healthy`)
  } else {
    logger.fail(`${healthyCount}/${totalCount} services healthy`)
  }

  return results
}

// Usage
const results = await checkHealth([
  { name: 'API Server', url: 'https://api.example.com/health' },
  { name: 'Database', url: 'https://db.example.com/health' },
  { name: 'Cache', url: 'https://cache.example.com/health' }
])
```

## Task Queue with Concurrency Control

Execute tasks with limited concurrency:

```typescript
import { PromiseQueue } from '@socketsecurity/lib/promise-queue'
import { Spinner } from '@socketsecurity/lib/spinner'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  concurrency: number = 5
) {
  const logger = getDefaultLogger()
  const spinner = Spinner()

  logger.step(`Processing ${items.length} items with concurrency ${concurrency}`)

  const queue = new PromiseQueue({ concurrency })
  let completed = 0

  spinner.progress(0, items.length, 'items')

  const tasks = items.map((item) =>
    queue.add(async () => {
      await processor(item)
      completed++
      spinner.progress(completed, items.length, 'items')
    })
  )

  await Promise.all(tasks)

  spinner.successAndStop(`Processed ${items.length} items`)
}

// Usage
const files = await glob('**/*.txt')
await processBatch(
  files,
  async (file) => {
    const content = await readFileUtf8(file)
    const processed = content.toUpperCase()
    await writeFileUtf8(file, processed)
  },
  10  // Process 10 files at a time
)
```

These examples demonstrate how to combine multiple utilities from @socketsecurity/lib to build robust CLI tools with proper error handling, progress feedback, and cross-platform support.
