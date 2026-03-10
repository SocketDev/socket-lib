# Package Management

Utilities for working with npm, pnpm, and yarn, including package manager detection, manifest parsing, and operations.

## When to Use Package Management Utilities

- Detecting which package manager a project uses
- Running package manager commands programmatically
- Parsing package.json and lock files
- Working with package manifests

## Quick Start

```typescript
import { detectPackageManager } from '@socketsecurity/lib/packages'
import { spawn } from '@socketsecurity/lib/spawn'

// Detect package manager from lock files
const pm = await detectPackageManager('./project')
console.log(`Using ${pm}`) // "npm", "pnpm", or "yarn"

// Run install with detected package manager
await spawn(pm, ['install'], { cwd: './project' })
```

## Package Manager Detection

### detectPackageManager()

**What it does:** Detects which package manager a project uses by checking for lock files.

**When to use:** Building tools that need to run package manager commands, creating scaffolds, automating installs.

**Parameters:**
- `projectPath` (string): Path to project directory

**Returns:** Promise<'npm' | 'pnpm' | 'yarn'>

**Detection Logic:**
1. Checks for `pnpm-lock.yaml` → returns `'pnpm'`
2. Checks for `yarn.lock` → returns `'yarn'`
3. Defaults to `'npm'`

**Example:**
```typescript
import { detectPackageManager } from '@socketsecurity/lib/packages'
import { spawn } from '@socketsecurity/lib/spawn'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

const logger = getDefaultLogger()

async function installDependencies(projectPath: string) {
  const pm = await detectPackageManager(projectPath)
  logger.info(`Detected package manager: ${pm}`)

  logger.step(`Installing with ${pm}`)
  await spawn(pm, ['install'], { cwd: projectPath })
  logger.success('Dependencies installed')
}

await installDependencies('./my-project')
```

**Common Pitfalls:**
- Function looks for lock files, not package manager binaries
- If no lock file exists, defaults to npm (even if pnpm/yarn is installed)
- Doesn't check `packageManager` field in package.json

## Package Manager Operations

### Running Commands with Different Package Managers

```typescript
import { detectPackageManager } from '@socketsecurity/lib/packages'
import { spawn } from '@socketsecurity/lib/spawn'

async function runScript(projectPath: string, scriptName: string) {
  const pm = await detectPackageManager(projectPath)

  // Package manager-specific command syntax
  const args = pm === 'npm' ? ['run', scriptName] : [scriptName]

  await spawn(pm, args, { cwd: projectPath })
}

// Usage
await runScript('./project', 'test')
// npm: runs "npm run test"
// pnpm/yarn: runs "pnpm test" or "yarn test"
```

### Installing Specific Packages

```typescript
async function addPackage(
  projectPath: string,
  packageName: string,
  options: { dev?: boolean; exact?: boolean } = {}
) {
  const pm = await detectPackageManager(projectPath)

  const args = ['add', packageName]

  if (options.dev) {
    args.push(pm === 'npm' ? '--save-dev' : '-D')
  }

  if (options.exact) {
    args.push(pm === 'npm' ? '--save-exact' : '-E')
  }

  await spawn(pm, args, { cwd: projectPath })
}

// Usage
await addPackage('./project', 'lodash')
await addPackage('./project', 'typescript', { dev: true, exact: true })
```

## Package Manifest Operations

### Reading package.json

```typescript
import { readJson } from '@socketsecurity/lib/fs'

interface PackageJson {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

const pkg = await readJson<PackageJson>('./package.json')
console.log(`Package: ${pkg.name}@${pkg.version}`)

// Check if dependency exists
if (pkg.dependencies?.['lodash']) {
  console.log('lodash is installed')
}

// List all scripts
if (pkg.scripts) {
  Object.keys(pkg.scripts).forEach(script => {
    console.log(`${script}: ${pkg.scripts![script]}`)
  })
}
```

### Updating package.json

```typescript
import { readJson, writeJson } from '@socketsecurity/lib/fs'

async function updateVersion(newVersion: string) {
  const pkg = await readJson('./package.json')
  pkg.version = newVersion

  await writeJson('./package.json', pkg, {
    spaces: 2  // Maintain formatting
  })

  console.log(`Updated version to ${newVersion}`)
}

await updateVersion('2.0.0')
```

### Adding Scripts

```typescript
import { readJson, writeJson } from '@socketsecurity/lib/fs'

async function addScript(name: string, command: string) {
  const pkg = await readJson('./package.json')

  if (!pkg.scripts) {
    pkg.scripts = {}
  }

  pkg.scripts[name] = command

  await writeJson('./package.json', pkg, { spaces: 2 })
  console.log(`Added script "${name}": ${command}`)
}

await addScript('dev', 'vite')
await addScript('build', 'tsc && vite build')
```

## Lock File Operations

### Checking Lock File Integrity

```typescript
import { findUpSync } from '@socketsecurity/lib/fs'

function getLockFile(projectPath: string): string | undefined {
  return findUpSync(['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'], {
    cwd: projectPath
  })
}

const lockFile = getLockFile('./project')
if (lockFile) {
  console.log(`Found lock file: ${lockFile}`)
} else {
  console.log('No lock file found')
}
```

### Regenerating Lock Files

```typescript
import { safeDelete } from '@socketsecurity/lib/fs'
import { spawn } from '@socketsecurity/lib/spawn'

async function regenerateLockFile(projectPath: string) {
  const pm = await detectPackageManager(projectPath)

  // Delete old lock file
  const lockFiles = {
    npm: 'package-lock.json',
    pnpm: 'pnpm-lock.yaml',
    yarn: 'yarn.lock'
  }

  await safeDelete(`${projectPath}/${lockFiles[pm]}`)

  // Regenerate
  await spawn(pm, ['install'], { cwd: projectPath })
}
```

## Real-World Examples

### Smart Package Installer

```typescript
import { detectPackageManager } from '@socketsecurity/lib/packages'
import { spawn } from '@socketsecurity/lib/spawn'
import { Spinner } from '@socketsecurity/lib/spinner'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

async function smartInstall(
  projectPath: string,
  packages: string[],
  options: { dev?: boolean } = {}
) {
  const logger = getDefaultLogger()
  const spinner = Spinner()

  const pm = await detectPackageManager(projectPath)
  logger.info(`Using ${pm}`)

  spinner.start(`Installing ${packages.length} package(s)...`)

  try {
    const args = pm === 'npm' ? ['install'] : ['add']

    if (options.dev) {
      args.push(pm === 'npm' ? '--save-dev' : '-D')
    }

    args.push(...packages)

    await spawn(pm, args, {
      cwd: projectPath,
      stdio: 'pipe',
      spinner
    })

    spinner.successAndStop(`Installed ${packages.join(', ')}`)
  } catch (error) {
    spinner.failAndStop('Installation failed')
    throw error
  }
}

// Usage
await smartInstall('./project', ['lodash', 'axios'])
await smartInstall('./project', ['typescript', '@types/node'], { dev: true })
```

### Dependency Version Checker

```typescript
import { readJson } from '@socketsecurity/lib/fs'
import { httpJson } from '@socketsecurity/lib/http-request'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

interface NpmPackage {
  'dist-tags': {
    latest: string
  }
}

async function checkOutdated(projectPath: string) {
  const logger = getDefaultLogger()
  const pkg = await readJson(`${projectPath}/package.json`)

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies
  }

  logger.step('Checking for updates')

  for (const [name, currentVersion] of Object.entries(deps)) {
    try {
      const data = await httpJson<NpmPackage>(
        `https://registry.npmjs.org/${name}`
      )

      const latest = data['dist-tags'].latest

      if (latest !== currentVersion.replace(/^[^0-9]*/, '')) {
        logger.warn(`${name}: ${currentVersion} → ${latest}`)
      } else {
        logger.success(`${name}: ${currentVersion} (up to date)`)
      }
    } catch (error) {
      logger.error(`Failed to check ${name}`)
    }
  }
}

await checkOutdated('./my-project')
```

### Workspace Management

```typescript
import { readJson, readDirNames } from '@socketsecurity/lib/fs'
import path from 'node:path'

interface Workspace {
  name: string
  path: string
  version: string
  dependencies: string[]
}

async function listWorkspaces(rootPath: string): Promise<Workspace[]> {
  const rootPkg = await readJson(`${rootPath}/package.json`)

  if (!rootPkg.workspaces) {
    return []
  }

  const workspaceDirs = await readDirNames(`${rootPath}/packages`)
  const workspaces: Workspace[] = []

  for (const dir of workspaceDirs) {
    const pkgPath = path.join(rootPath, 'packages', dir, 'package.json')
    const pkg = await readJson(pkgPath)

    workspaces.push({
      name: pkg.name,
      path: path.join(rootPath, 'packages', dir),
      version: pkg.version,
      dependencies: Object.keys(pkg.dependencies || {})
    })
  }

  return workspaces
}

// Usage
const workspaces = await listWorkspaces('./monorepo')
workspaces.forEach(ws => {
  console.log(`${ws.name}@${ws.version}`)
  console.log(`  Dependencies: ${ws.dependencies.length}`)
})
```

### Package Manager Command Runner

```typescript
import { detectPackageManager } from '@socketsecurity/lib/packages'
import { spawn } from '@socketsecurity/lib/spawn'

class PackageManager {
  constructor(private pm: 'npm' | 'pnpm' | 'yarn', private cwd: string) {}

  static async detect(cwd: string) {
    const pm = await detectPackageManager(cwd)
    return new PackageManager(pm, cwd)
  }

  async install() {
    await spawn(this.pm, ['install'], { cwd: this.cwd })
  }

  async add(packages: string[], dev = false) {
    const args = this.pm === 'npm' ? ['install'] : ['add']
    if (dev) args.push(this.pm === 'npm' ? '--save-dev' : '-D')
    args.push(...packages)

    await spawn(this.pm, args, { cwd: this.cwd })
  }

  async remove(packages: string[]) {
    const args = this.pm === 'npm' ? ['uninstall'] : ['remove']
    args.push(...packages)

    await spawn(this.pm, args, { cwd: this.cwd })
  }

  async runScript(scriptName: string) {
    const args = this.pm === 'npm' ? ['run', scriptName] : [scriptName]
    await spawn(this.pm, args, { cwd: this.cwd })
  }
}

// Usage
const pm = await PackageManager.detect('./project')
await pm.install()
await pm.add(['lodash'], false)
await pm.add(['typescript'], true)
await pm.runScript('test')
```

## Troubleshooting

### Wrong package manager detected

**Problem:** Detection picks wrong package manager.

**Solution:**
1. Ensure lock file exists for your package manager
2. Delete conflicting lock files
3. Or explicitly specify the package manager:
   ```typescript
   const pm = 'pnpm'  // Force specific PM
   await spawn(pm, ['install'], { cwd: projectPath })
   ```

### Package manager command fails

**Problem:** Spawn fails when running PM command.

**Solution:**
1. Verify package manager is installed:
   ```bash
   which npm pnpm yarn
   ```

2. Check package manager is in PATH
3. Use full path if needed:
   ```typescript
   await spawn('/usr/local/bin/pnpm', ['install'])
   ```

### Lock file conflicts

**Problem:** Multiple lock files in project.

**Solution:**
1. Choose one package manager
2. Delete other lock files:
   ```typescript
   await safeDelete(['package-lock.json', 'yarn.lock'])
   // Keep pnpm-lock.yaml
   ```
3. Regenerate lock file

### Permission errors during install

**Problem:** EACCES errors when installing packages.

**Solution:**
1. Don't use sudo with package managers
2. Fix npm permissions:
   ```bash
   mkdir -p ~/.npm-global
   npm config set prefix '~/.npm-global'
   ```
3. Add to PATH in ~/.bashrc or ~/.zshrc:
   ```bash
   export PATH=~/.npm-global/bin:$PATH
   ```
