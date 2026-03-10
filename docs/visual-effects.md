# Visual Effects

Visual feedback is essential for CLI tools. This library provides spinners, loggers, themes, and progress indicators to create polished user experiences.

## When to Use Visual Effects

- **Spinners**: Show progress for long-running operations
- **Logger**: Display status messages with colored symbols
- **Progress Bars**: Track file processing, downloads, or build steps
- **Themes**: Customize colors for branding or accessibility

## Quick Start

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'
import { getDefaultLogger } from '@socketsecurity/lib/logger'

const spinner = Spinner({ text: 'Processing...' })
spinner.start()
// ... do work ...
spinner.successAndStop('Complete!')

const logger = getDefaultLogger()
logger.success('All tests passed')
logger.fail('Build failed')
```

## Spinner API

### Creating a Spinner

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'

const spinner = Spinner({
  text: 'Loading data...',
  color: [140, 82, 255], // Socket purple RGB
  spinner: 'dots'  // Animation style
})
```

**What it does:** Creates an animated CLI spinner with custom text, colors, and animation style.

**When to use:** Use spinners for operations that take more than a few seconds (network requests, file processing, builds).

**Parameters:**
- `text` (string): Initial message to display
- `color` (ColorValue): RGB tuple `[r, g, b]` or color name like `'cyan'`
- `spinner` (SpinnerStyle): Animation frames (defaults to `'socket'` style)
- `shimmer` (ShimmerConfig): Optional text shimmer effect

**Returns:** Spinner instance with methods for updating state

**Example:**
```typescript
import { Spinner } from '@socketsecurity/lib/spinner'

const spinner = Spinner({ text: 'Fetching data from API...' })
spinner.start()

// Update spinner text while running
spinner.text('Processing response...')

// Show success without stopping
spinner.success('API request complete')
spinner.text('Saving to database...')

// Stop with final message
spinner.successAndStop('All operations complete')
```

**Common Pitfalls:**
- Don't forget to call `.start()` - the spinner won't animate until started
- Remember that methods WITHOUT "AndStop" keep the spinner running
- Call `.stop()` or `.successAndStop()` when done to clean up properly

### Spinner Methods

#### start(text?: string)

Begins the spinner animation.

```typescript
spinner.start('Loading...')
```

#### stop(text?: string)

Stops the spinner and clears it from the terminal.

```typescript
spinner.stop('Done')
```

#### success(text?: string)

Shows a green checkmark (✓) while continuing to spin.

```typescript
spinner.success('Step 1 complete')
spinner.text('Working on step 2...')
```

#### successAndStop(text?: string)

Shows success and stops the spinner.

```typescript
spinner.successAndStop('All done!')
```

#### fail(text?: string)

Shows a red X (✗) while continuing to spin.

```typescript
spinner.fail('Step failed, retrying...')
```

#### failAndStop(text?: string)

Shows failure and stops the spinner.

```typescript
spinner.failAndStop('Operation failed')
```

#### warn(text?: string)

Shows a yellow warning (⚠) while continuing.

```typescript
spinner.warn('Deprecated API used')
```

#### warnAndStop(text?: string)

Shows warning and stops.

```typescript
spinner.warnAndStop('Using fallback method')
```

#### text(value: string)

Updates the spinner text while running.

```typescript
spinner.text('Processing file 2 of 10...')
```

#### progress(current: number, total: number, unit?: string)

Displays a progress bar.

```typescript
spinner.progress(5, 10, 'files')
// Shows: ███████░░░░░░░░░░░░░ 50% (5/10 files)
```

#### progressStep(amount?: number)

Increments progress by the given amount (default: 1).

```typescript
for (const file of files) {
  processFile(file)
  spinner.progressStep()
}
```

#### indent(spaces?: number)

Increases indentation (default: 2 spaces).

```typescript
spinner.indent()
spinner.text('  Nested operation')
spinner.dedent()
```

#### dedent(spaces?: number)

Decreases indentation.

```typescript
spinner.dedent()
```

### Spinner Shimmer Effects

Add animated shimmer effects to spinner text:

```typescript
const spinner = Spinner({
  text: 'Building...',
  shimmer: {
    dir: 'ltr',      // left-to-right
    color: [255, 0, 255],  // magenta
    speed: 0.5       // animation speed
  }
})
```

**Directions:**
- `'ltr'` - Left to right
- `'rtl'` - Right to left
- `'ttb'` - Top to bottom
- `'btt'` - Bottom to top

## Logger API

### Getting a Logger

```typescript
import { getDefaultLogger } from '@socketsecurity/lib/logger'

const logger = getDefaultLogger()
```

**What it does:** Returns a singleton logger instance for console output with colored symbols.

**When to use:** Use the logger for all status messages, errors, warnings, and informational output in CLI tools.

### Logger Methods

#### success(message: string, ...extras: unknown[])

Logs a success message with green checkmark (✓).

```typescript
logger.success('Tests passed')
logger.success('Build completed in', timer.elapsed(), 'ms')
```

#### fail(message: string, ...extras: unknown[])

Logs a failure message with red X (✗).

```typescript
logger.fail('Tests failed')
logger.fail('Error details:', error)
```

#### warn(message: string, ...extras: unknown[])

Logs a warning with yellow warning symbol (⚠).

```typescript
logger.warn('Deprecated API used')
```

#### info(message: string, ...extras: unknown[])

Logs information with blue info symbol (ℹ).

```typescript
logger.info('Starting build process')
```

#### skip(message: string, ...extras: unknown[])

Logs a skip message with cyan skip symbol (↻).

```typescript
logger.skip('Test skipped due to environment')
```

#### step(message: string, ...extras: unknown[])

Logs a main step with cyan arrow (→) and blank line before.

```typescript
logger.step('Building application')
logger.log('Compiling TypeScript...')
logger.log('Bundling assets...')
```

#### substep(message: string, ...extras: unknown[])

Logs an indented sub-step (2 spaces).

```typescript
logger.step('Installing dependencies')
logger.substep('Resolving package versions')
logger.substep('Downloading packages')
logger.substep('Linking binaries')
```

#### log(message: string, ...extras: unknown[])

Logs to stdout without symbols.

```typescript
logger.log('Processing file:', filename)
```

#### error(message: string, ...extras: unknown[])

Logs to stderr without symbols.

```typescript
logger.error('An error occurred:', error.message)
```

### Logger Indentation

Control output indentation for nested operations:

```typescript
logger.log('Main operation')
logger.indent()
logger.log('  Sub-operation 1')
logger.log('  Sub-operation 2')
logger.dedent()
logger.log('Back to main level')
```

### Logger Groups

Create collapsible log groups:

```typescript
logger.group('Build Process')
logger.log('Step 1: Compile')
logger.log('Step 2: Bundle')
logger.groupEnd()
```

### Method Chaining

All logger methods return `this` for chaining:

```typescript
logger
  .step('Phase 1')
  .indent()
  .log('Task A')
  .log('Task B')
  .dedent()
  .step('Phase 2')
```

## Log Symbols

Access colored symbols directly:

```typescript
import { LOG_SYMBOLS } from '@socketsecurity/lib/logger'

console.log(`${LOG_SYMBOLS.success} Operation complete`)
console.log(`${LOG_SYMBOLS.fail} Operation failed`)
console.log(`${LOG_SYMBOLS.warn} Warning message`)
console.log(`${LOG_SYMBOLS.info} Info message`)
console.log(`${LOG_SYMBOLS.step} Processing step`)
```

**Available Symbols:**
- `success` - Green checkmark (✔ or √)
- `fail` - Red X (✖ or ×)
- `warn` - Yellow warning (⚠ or ‼)
- `info` - Blue info (ℹ or i)
- `step` - Cyan arrow (→ or >)
- `skip` - Cyan skip (↻ or @)
- `progress` - Cyan progress (∴ or :.)

## Themes

Customize colors across the entire library:

```typescript
import { setTheme } from '@socketsecurity/lib/themes/context'
import { THEMES } from '@socketsecurity/lib/themes/themes'

// Use a built-in theme
setTheme(THEMES.sunset)

// Or create a custom theme
setTheme({
  colors: {
    primary: [100, 200, 255],
    success: [0, 255, 0],
    error: [255, 0, 0],
    warning: [255, 200, 0],
    info: [0, 150, 255],
    step: [150, 150, 255]
  }
})
```

**Built-in Themes:**
- `socket` - Default Socket.dev theme (purple/magenta)
- `sunset` - Warm oranges and yellows
- `ocean` - Cool blues and teals
- `forest` - Natural greens
- `monochrome` - Black and white

## Real-World Examples

### Progress Tracking for File Processing

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'
import { readDirNames } from '@socketsecurity/lib/fs'

const spinner = Spinner({ text: 'Processing files...' })
spinner.start()

const files = await readDirNames('./src')
spinner.progress(0, files.length, 'files')

for (let i = 0; i < files.length; i++) {
  await processFile(files[i])
  spinner.progress(i + 1, files.length, 'files')
}

spinner.successAndStop(`Processed ${files.length} files`)
```

### Multi-Step Build Process

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'

const spinner = Spinner()

spinner.start('Compiling TypeScript...')
await compileTypeScript()
spinner.success('TypeScript compiled')

spinner.text('Bundling JavaScript...')
await bundleJavaScript()
spinner.success('JavaScript bundled')

spinner.text('Optimizing assets...')
await optimizeAssets()
spinner.success('Assets optimized')

spinner.successAndStop('Build complete!')
```

### Hierarchical Logging

```typescript
import { getDefaultLogger } from '@socketsecurity/lib/logger'

const logger = getDefaultLogger()

logger.step('Testing')
logger.indent()
logger.log('Running unit tests...')
logger.success('Unit tests: 42/42 passed')
logger.log('Running integration tests...')
logger.success('Integration tests: 15/15 passed')
logger.dedent()

logger.step('Building')
logger.indent()
logger.log('Compiling...')
logger.success('Compilation complete')
logger.dedent()
```

## Troubleshooting

### Spinner Not Animating

**Problem:** Spinner text appears but doesn't animate.

**Solution:** Make sure you called `.start()`:
```typescript
const spinner = Spinner({ text: 'Loading...' })
spinner.start()  // Don't forget this!
```

### Spinner Leaves Artifacts

**Problem:** Spinner leaves visual artifacts when stopped.

**Solution:** Use the `*AndStop` methods which auto-clear:
```typescript
// Good
spinner.successAndStop('Done')

// Avoid
spinner.success('Done')
spinner.stop()
```

### Colors Not Showing

**Problem:** Symbols and text appear without colors.

**Solution:** Check if your terminal supports colors and ANSI codes. Most modern terminals do, but some CI environments may not.

### Progress Bar Not Updating

**Problem:** Progress bar stuck at 0%.

**Solution:** Make sure you're calling `progressStep()` or `progress()` with updated values:
```typescript
spinner.progress(0, total, 'items')
for (const item of items) {
  processItem(item)
  spinner.progressStep()  // Don't forget to increment
}
```
