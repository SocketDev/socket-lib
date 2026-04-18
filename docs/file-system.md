# File System Operations

Comprehensive file system utilities with cross-platform support, safe deletion, and convenient wrappers around Node.js fs module.

## When to Use File System Utilities

- Reading/writing text and JSON files
- Safely deleting files and directories
- Finding files by traversing parent directories
- Checking if paths exist or are readable
- Working with globs and path patterns

## Quick Start

```typescript
import {
  readFileUtf8,
  writeJson,
  safeDelete,
  findUpSync,
} from '@socketsecurity/lib/fs'

// Read a text file
const content = await readFileUtf8('./README.md')

// Write JSON with formatting
await writeJson('./config.json', { version: '1.0.0' })

// Safely delete (protected against deleting parent directories)
await safeDelete('./temp-dir')

// Find package.json in current or parent directories
const pkgPath = findUpSync('package.json')
```

## Reading Files

### readFileUtf8()

**What it does:** Reads a file as a UTF-8 string asynchronously.

**When to use:** Reading text files like README.md, config files, or any UTF-8 encoded content.

**Parameters:**

- `filepath` (PathLike): Path to the file
- `options` (ReadFileOptions): Optional encoding and abort signal

**Returns:** Promise<string> with file contents

**Example:**

```typescript
import { readFileUtf8 } from '@socketsecurity/lib/fs'

// Read a text file
const content = await readFileUtf8('./README.md')
console.log(content)

// With abort signal
const controller = new AbortController()
const content = await readFileUtf8('./large-file.txt', {
  signal: controller.signal,
})
```

**Common Pitfalls:**

- File path must exist or the promise will reject
- Use `safeReadFile()` if you want to handle missing files gracefully

### readFileUtf8Sync()

Synchronous version of `readFileUtf8()`:

```typescript
import { readFileUtf8Sync } from '@socketsecurity/lib/fs'

const content = readFileUtf8Sync('./config.txt')
```

### readFileBinary()

**What it does:** Reads a file as a Buffer (binary data).

**When to use:** Reading images, archives, or any binary file format.

**Returns:** Promise<Buffer>

**Example:**

```typescript
import { readFileBinary } from '@socketsecurity/lib/fs'

// Read an image
const imageBuffer = await readFileBinary('./logo.png')
console.log('Image size:', imageBuffer.length, 'bytes')

// Read a compressed file
const archive = await readFileBinary('./backup.tar.gz')
```

### readJson()

**What it does:** Reads and parses a JSON file in one step.

**When to use:** Reading package.json, tsconfig.json, or any JSON configuration file.

**Parameters:**

- `filepath` (PathLike): Path to JSON file
- `options` (ReadJsonOptions): Optional reviver function, encoding, and error handling

**Returns:** `Promise<T>` with parsed JSON data (default `T = unknown`)

**Example:**

```typescript
import { readJson } from '@socketsecurity/lib/fs'

// Read and parse package.json
const pkg = await readJson('./package.json')
console.log(`Package: ${pkg.name} v${pkg.version}`)

// With custom reviver to transform dates
const data = await readJson('./data.json', {
  reviver: (key, value) => {
    if (key === 'createdAt') return new Date(value)
    return value
  },
})

// Don't throw on parse errors
const config = await readJson('./optional-config.json', { throws: false })
if (config === undefined) {
  console.log('Config file not found, using defaults')
}
```

**Common Pitfalls:**

- JSON parse errors will throw unless `throws: false` is set
- Missing files throw an error with helpful context
- Permission errors include suggestions for fixing access

### readJsonSync()

Synchronous version of `readJson()`:

```typescript
import { readJsonSync } from '@socketsecurity/lib/fs'

const tsconfig = readJsonSync('./tsconfig.json')
```

### safeReadFile()

**What it does:** Reads a file and returns `undefined` on error instead of throwing.

**When to use:** When a file may not exist and you want to handle it gracefully.

**Returns:** Promise<string | Buffer | undefined>

**Example:**

```typescript
import { safeReadFile } from '@socketsecurity/lib/fs'

// Try to read, get undefined if it doesn't exist
const config = await safeReadFile('./optional-config.txt')
if (config) {
  console.log('Config found:', config)
} else {
  console.log('Using default configuration')
}

// Read binary data
const buffer = await safeReadFile('./image.png', { encoding: null })
```

## Writing Files

### writeJson()

**What it does:** Stringify and write JSON to a file with formatting.

**When to use:** Saving configuration, package.json updates, or any JSON data.

**Parameters:**

- `filepath` (PathLike): Path to write to
- `jsonContent` (unknown): Value to stringify
- `options` (WriteJsonOptions): Formatting options

**Returns:** Promise<void>

**Example:**

```typescript
import { writeJson } from '@socketsecurity/lib/fs'

// Write with default 2-space indentation
await writeJson('./config.json', {
  name: 'my-app',
  version: '1.0.0',
})

// Custom indentation
await writeJson('./data.json', data, { spaces: 4 })

// Use tabs
await writeJson('./formatted.json', data, { spaces: '\t' })

// Windows line endings
await writeJson('./win-data.json', data, { EOL: '\r\n' })

// No final newline
await writeJson('./compact.json', data, { finalEOL: false })
```

**Common Pitfalls:**

- Parent directory must exist (use `safeMkdir()` to create it first)
- Circular references in the object will throw an error

### writeJsonSync()

Synchronous version of `writeJson()`:

```typescript
import { writeJsonSync } from '@socketsecurity/lib/fs'

writeJsonSync('./config.json', { version: '2.0.0' })
```

## Directory Operations

### readDirNames()

**What it does:** Reads directory names (not files) from a directory.

**When to use:** Finding subdirectories, listing folders.

**Parameters:**

- `dirname` (PathLike): Directory to read
- `options` (ReadDirOptions): Filtering and sorting options

**Returns:** Promise<string[]> with directory names

**Example:**

```typescript
import { readDirNames } from '@socketsecurity/lib/fs'

// Get all subdirectories
const dirs = await readDirNames('./packages')
console.log('Subdirectories:', dirs)

// Exclude empty directories
const nonEmpty = await readDirNames('./cache', {
  includeEmpty: false,
})

// Ignore specific patterns
const dirs = await readDirNames('./src', {
  ignore: ['node_modules', '.git'],
})

// Disable sorting
const unsorted = await readDirNames('./src', { sort: false })
```

### readDirNamesSync()

Synchronous version of `readDirNames()`:

```typescript
import { readDirNamesSync } from '@socketsecurity/lib/fs'

const dirs = readDirNamesSync('./packages')
```

### isDirEmpty()

Not yet implemented (only `isDirEmptySync` is available).

### isDirEmptySync()

**What it does:** Checks if a directory is empty (contains no files).

**When to use:** Before deletion, checking if a cache directory needs cleanup.

**Parameters:**

- `dirname` (PathLike): Directory to check
- `options` (IsDirEmptyOptions): Optional ignore patterns

**Returns:** boolean

**Example:**

```typescript
import { isDirEmptySync } from '@socketsecurity/lib/fs'

if (isDirEmptySync('./cache')) {
  console.log('Cache is empty')
}

// Ignore .DS_Store files on macOS
const isEmpty = isDirEmptySync('./temp', {
  ignore: ['.DS_Store'],
})
```

### isDir()

**What it does:** Checks if a path is a directory asynchronously.

**Returns:** Promise<boolean>

**Example:**

```typescript
import { isDir } from '@socketsecurity/lib/fs'

if (await isDir('./src')) {
  console.log('src is a directory')
}
```

### isDirSync()

Synchronous version of `isDir()`:

```typescript
import { isDirSync } from '@socketsecurity/lib/fs'

if (isDirSync('./dist')) {
  console.log('dist exists and is a directory')
}
```

### safeMkdir()

**What it does:** Creates a directory, ignoring EEXIST errors (already exists).

**When to use:** Ensuring a directory exists before writing files to it.

**Parameters:**

- `path` (PathLike): Directory to create
- `options` (MakeDirectoryOptions): Optional mode and recursive settings

**Returns:** Promise<void>

**Example:**

```typescript
import { safeMkdir } from '@socketsecurity/lib/fs'

// Create directory (defaults to recursive: true)
await safeMkdir('./data/cache')

// Create with specific permissions
await safeMkdir('./secure', { mode: 0o700 })

// Non-recursive
await safeMkdir('./single-level', { recursive: false })
```

**Common Pitfalls:**

- Permission errors will still throw (only EEXIST is ignored)
- Parent directories must exist if `recursive: false`

### safeMkdirSync()

Synchronous version of `safeMkdir()`:

```typescript
import { safeMkdirSync } from '@socketsecurity/lib/fs'

safeMkdirSync('./output')
```

## File/Directory Deletion

### safeDelete()

**What it does:** Safely deletes files/directories with protection against deleting parent directories.

**When to use:** Cleaning up build artifacts, temporary files, or cache directories.

**Safety Features:**

- Prevents deleting current working directory (cwd) and above
- Allows deleting within cwd without `force` option
- Auto-enables `force` for temp directory, cacache, and ~/.socket
- Protects against `../` path injection

**Parameters:**

- `filepath` (PathLike | PathLike[]): Path or paths to delete (supports globs)
- `options` (RemoveOptions): Deletion options

**Returns:** Promise<void>

**Example:**

```typescript
import { safeDelete } from '@socketsecurity/lib/fs'

// Delete a directory (safe by default)
await safeDelete('./build')

// Delete multiple paths
await safeDelete(['./dist', './coverage'])

// Use glob patterns
await safeDelete(['./temp/**', '!./temp/keep.txt'])

// Force delete outside cwd (use with caution!)
await safeDelete('../parent-dir', { force: true })

// Custom retry settings
await safeDelete('./flaky-dir', {
  maxRetries: 5,
  retryDelay: 500,
})
```

**Common Pitfalls:**

- Attempting to delete cwd or parent directories without `force: true` will throw
- Glob patterns must be valid or deletion will fail
- On Windows, files in use cannot be deleted even with retries

### safeDeleteSync()

Synchronous version of `safeDelete()`:

```typescript
import { safeDeleteSync } from '@socketsecurity/lib/fs'

safeDeleteSync('./temp')
```

## Finding Files

### findUp()

**What it does:** Searches for a file by traversing up parent directories.

**When to use:** Finding package.json, .git directory, configuration files in parent folders.

**Parameters:**

- `name` (string | string[]): Filename(s) to search for
- `options` (FindUpOptions): Search options

**Returns:** Promise<string | undefined> with normalized absolute path

**Example:**

```typescript
import { findUp } from '@socketsecurity/lib/fs'

// Find package.json starting from current directory
const pkgPath = await findUp('package.json')
console.log('Found at:', pkgPath)

// Find any of multiple config files
const configPath = await findUp(['.config.js', '.config.json', '.config.yaml'])

// Find a directory
const nodeModules = await findUp('node_modules', {
  onlyDirectories: true,
})

// Start from specific directory
const path = await findUp('tsconfig.json', {
  cwd: '/path/to/project',
})
```

### findUpSync()

**What it does:** Synchronous version of `findUp()` with optional `stopAt` parameter.

**Parameters:**

- `name` (string | string[]): Filename(s) to search for
- `options` (FindUpSyncOptions): Search options including `stopAt`

**Returns:** string | undefined

**Example:**

```typescript
import { findUpSync } from '@socketsecurity/lib/fs'

// Find .git directory
const gitPath = findUpSync('.git', { onlyDirectories: true })

// Stop searching at home directory
const eslintPath = findUpSync('.eslintrc', {
  stopAt: process.env.HOME,
})
```

## Path Utilities

### isSymLinkSync()

**What it does:** Checks if a path is a symbolic link.

**Returns:** boolean

**Example:**

```typescript
import { isSymLinkSync } from '@socketsecurity/lib/fs'

if (isSymLinkSync('./my-link')) {
  console.log('Path is a symbolic link')
}
```

### uniqueSync()

**What it does:** Generates a unique filepath by adding number suffixes.

**When to use:** Creating files without overwriting existing ones.

**Returns:** string (normalized unique path)

**Example:**

```typescript
import { uniqueSync } from '@socketsecurity/lib/fs'

// If 'report.pdf' exists, returns 'report-1.pdf'
const path = uniqueSync('./report.pdf')

// If 'data.json' and 'data-1.json' exist, returns 'data-2.json'
const uniquePath = uniqueSync('./data.json')
```

## Validation

### validateFiles()

**What it does:** Validates that file paths are readable.

**When to use:** Before processing files from glob results, especially with Yarn Berry PnP or pnpm symlinks.

**Returns:** ValidateFilesResult with `validPaths` and `invalidPaths` arrays

**Example:**

```typescript
import { validateFiles } from '@socketsecurity/lib/fs'

const files = ['package.json', '.pnp.cjs/virtual-file.json']
const { validPaths, invalidPaths } = validateFiles(files)

console.log(`Valid: ${validPaths.length}`)
console.log(`Invalid: ${invalidPaths.length}`)

// Only process valid files
for (const path of validPaths) {
  await processFile(path)
}
```

## Stats and Checking

### safeStats()

**What it does:** Gets file stats, returning `undefined` on error.

**Returns:** Promise<Stats | undefined>

**Example:**

```typescript
import { safeStats } from '@socketsecurity/lib/fs'

const stats = await safeStats('./file.txt')
if (stats) {
  console.log('Size:', stats.size)
  console.log('Modified:', stats.mtime)
  console.log('Is file:', stats.isFile())
}
```

### safeStatsSync()

Synchronous version of `safeStats()`:

```typescript
import { safeStatsSync } from '@socketsecurity/lib/fs'

const stats = safeStatsSync('./file.txt')
```

## Real-World Examples

### Safe Configuration Loading

```typescript
import { readJson, safeReadFile } from '@socketsecurity/lib/fs'

// Try custom config first, fall back to defaults
const customConfig = await readJson('./config.json', { throws: false })
const defaultConfig = await readJson('./config.default.json')

const config = customConfig || defaultConfig
```

### Build Artifact Cleanup

```typescript
import { safeDelete, isDirEmptySync } from '@socketsecurity/lib/fs'

// Clean build artifacts
await safeDelete(['./dist', './coverage', './.next'])

// Remove cache if empty
if (isDirEmptySync('./cache')) {
  await safeDelete('./cache')
}
```

### Finding Project Root

```typescript
import { findUpSync } from '@socketsecurity/lib/fs'
import { dirname } from 'node:path'

// Find project root by looking for package.json
const pkgPath = findUpSync('package.json')
if (pkgPath) {
  const projectRoot = dirname(pkgPath)
  console.log('Project root:', projectRoot)
}
```

### Processing Files with Validation

```typescript
// Note: fast-glob is an external dependency - install it separately
import { glob } from 'fast-glob'
import { validateFiles, readFileUtf8 } from '@socketsecurity/lib/fs'

// Get all TypeScript files
const allFiles = await glob('src/**/*.ts')

// Validate they're readable
const { validPaths } = validateFiles(allFiles)

// Process only valid files
for (const file of validPaths) {
  const content = await readFileUtf8(file)
  await processTypeScript(content)
}
```

### Extracting Archives

```typescript
import {
  extractArchive,
  detectArchiveFormat,
} from '@socketsecurity/lib/archives'

// Detect archive format
const format = detectArchiveFormat('package.tar.gz')
console.log(format) // 'tar.gz'

// Extract archive with safety limits
await extractArchive('package.tar.gz', './output', {
  strip: 1, // Strip one leading path component
  maxFileSize: 100 * 1024 * 1024, // 100MB per file
  maxTotalSize: 1024 * 1024 * 1024, // 1GB total
})

// Supports: .zip, .tar, .tar.gz, .tgz
// Built-in protection against zip bombs and path traversal
```

## Troubleshooting

### ENOENT: no such file or directory

**Problem:** File or directory doesn't exist.

**Solution:**

- Use `safeReadFile()` for optional files
- Check paths are absolute or relative to correct location
- Ensure parent directories exist before writing files

### EACCES: permission denied

**Problem:** Insufficient permissions to read/write file.

**Solution:**

- Check file permissions with `ls -la` (Unix) or file properties (Windows)
- Run with appropriate user permissions
- For `safeDelete()`, ensure you have write access to parent directory

### Force deletion throwing error

**Problem:** `safeDelete()` throws error when trying to delete protected path.

**Solution:**

- Only use `force: true` when absolutely necessary
- Verify the path is correct and you intend to delete it
- Protected paths include cwd and parent directories for safety

### JSON parse errors

**Problem:** `readJson()` throws SyntaxError.

**Solution:**

- Verify file contains valid JSON
- Use `throws: false` option to handle gracefully
- Check for trailing commas (not allowed in JSON)

### File already exists

**Problem:** Writing fails because file exists.

**Solution:**

- Use `safeDelete()` to remove it first
- Or use `uniqueSync()` to generate a unique filename
