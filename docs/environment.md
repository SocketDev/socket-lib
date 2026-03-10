# Environment Detection

Detect CI environments, check Node.js environment settings, and access platform-specific environment variables in a type-safe way.

## When to Use Environment Detection

- Determining if code is running in CI/CD
- Checking development vs production mode
- Accessing cross-platform home directories
- Detecting terminal capabilities
- Conditional behavior based on environment

## Quick Start

```typescript
import { getCI } from '@socketsecurity/lib/env/ci'
import { getNodeEnv } from '@socketsecurity/lib/env/node-env'
import { isTest } from '@socketsecurity/lib/env/test'

if (getCI()) {
  console.log('Running in CI environment')
}

if (getNodeEnv() === 'production') {
  console.log('Production mode')
}

if (isTest()) {
  console.log('Running tests')
}
```

## Environment Getters

All environment getters are pure functions that access only their specific environment variable. For fallback logic, compose multiple getters.

### getCI()

**What it does:** Checks if code is running in a Continuous Integration environment.

**Returns:** `boolean`

**Example:**

```typescript
import { getCI } from '@socketsecurity/lib/env/ci'

if (getCI()) {
  // Disable interactive prompts
  // Use non-colored output
  // Skip browser-based tests
}
```

**Detected by:** Checks `CI` environment variable

### getNodeEnv()

**What it does:** Gets the Node.js environment mode.

**Returns:** `'development' | 'production' | 'test' | string`

**Example:**

```typescript
import { getNodeEnv } from '@socketsecurity/lib/env/node-env'

const env = getNodeEnv()

if (env === 'production') {
  enableOptimizations()
} else if (env === 'development') {
  enableDebugMode()
}
```

**Environment Variable:** `NODE_ENV`

### isTest()

**What it does:** Checks if code is running in test mode.

**Returns:** `boolean`

**Example:**

```typescript
import { isTest } from '@socketsecurity/lib/env/test'

if (isTest()) {
  // Use test database
  // Disable external API calls
  // Enable mocks
}
```

**Detected by:** Checks `NODE_ENV === 'test'`

### getHome()

**What it does:** Gets the user's home directory path.

**Returns:** `string | undefined`

**Example:**

```typescript
import { getHome } from '@socketsecurity/lib/env/home'

const home = getHome()
if (home) {
  const configPath = `${home}/.myapp/config.json`
}
```

**Environment Variable:** `HOME` (Unix/Linux/macOS)

**Cross-platform note:** For Windows, use `process.env.USERPROFILE` if needed

### getTerm()

**What it does:** Gets the terminal type.

**Returns:** `string | undefined`

**Example:**

```typescript
import { getTerm } from '@socketsecurity/lib/env/term'

const term = getTerm()
if (term === 'dumb') {
  // Disable colors and animations
}
```

**Environment Variable:** `TERM`

**Color support note:** For checking terminal color support, use `process.env.COLORTERM` directly or libraries like `supports-color`

## Testing with Rewiring

Environment getters support test rewiring without modifying `process.env`:

```typescript
import { setEnv, clearEnv, resetEnv } from '@socketsecurity/lib/env/rewire'
import { getCI } from '@socketsecurity/lib/env/ci'

// In test setup
beforeEach(() => {
  setEnv('CI', '1')
  expect(getCI()).toBe(true)
})

afterEach(() => {
  resetEnv() // Clear all overrides
})

// Or clear individual overrides
test('specific test', () => {
  setEnv('CI', '1')
  // ... test code ...
  clearEnv('CI')
})
```

**Benefits:**

- Isolated tests without polluting global `process.env`
- No side effects between tests
- Cleaner test code

## Real-World Examples

### CI-Specific Behavior

```typescript
import { getCI } from '@socketsecurity/lib/env/ci'
import { Spinner } from '@socketsecurity/lib/spinner'

const spinner = getCI()
  ? { start: () => {}, successAndStop: () => {} } // Noop in CI
  : Spinner({ text: 'Working...' })

spinner.start()
await doWork()
spinner.successAndStop('Complete')
```

### Environment-Specific Configuration

```typescript
import { getNodeEnv } from '@socketsecurity/lib/env/node-env'

const config = {
  apiUrl:
    getNodeEnv() === 'production'
      ? 'https://api.example.com'
      : 'http://localhost:3000',

  logLevel: getNodeEnv() === 'development' ? 'debug' : 'info',

  enableAnalytics: getNodeEnv() === 'production',
}
```

### Cross-Platform Paths

```typescript
import { getHome } from '@socketsecurity/lib/env/home'
import { WIN32 } from '@socketsecurity/lib/constants/platform'
import path from 'node:path'

function getConfigDir() {
  const home = getHome() || (WIN32 ? process.env.USERPROFILE : undefined)
  if (!home) {
    throw new Error('Cannot determine home directory')
  }

  return path.join(home, '.myapp')
}
```

### Terminal Capability Detection

```typescript
import { getTerm } from '@socketsecurity/lib/env/term'

function supportsColor() {
  const term = getTerm()
  const colorTerm = process.env.COLORTERM
  return term !== 'dumb' && colorTerm !== undefined
}

function getLogger() {
  const colors = supportsColor()
  return {
    success: msg =>
      console.log(colors ? `\x1b[32m✓\x1b[0m ${msg}` : `✓ ${msg}`),
    error: msg => console.log(colors ? `\x1b[31m✗\x1b[0m ${msg}` : `✗ ${msg}`),
  }
}
```

## Available Environment Getters

All getters follow the pattern `get<VarName>()` and return `string | boolean | undefined`:

- **CI/CD:**
  - `getCI()` - Checks `CI` variable

- **Node.js:**
  - `getNodeEnv()` - Checks `NODE_ENV`
  - `isTest()` - Checks if `NODE_ENV === 'test'`

- **User Directories:**
  - `getHome()` - Returns `HOME` (Unix/Linux/macOS)

- **Terminal:**
  - `getTerm()` - Returns `TERM`

- **Path:**
  - `getPath()` - Returns `PATH`

## Troubleshooting

### Environment variable not detected

**Problem:** Getter returns `undefined` when variable should be set.

**Solution:**

- Verify the environment variable is set (`echo $VAR` on Unix, `echo %VAR%` on Windows)
- Check spelling and case sensitivity
- Ensure variable is exported in shell (`export VAR=value`)

### CI not detected

**Problem:** `getCI()` returns `false` in CI environment.

**Solution:**

- Most CI systems set the `CI` variable automatically
- Manually set it in CI config if needed: `CI=1` or `CI=true`
- Check your CI provider's documentation for environment variables

### Cross-platform paths fail

**Problem:** Path doesn't work on Windows/Unix.

**Solution:**
Use the fallback pattern with `process.env` for Windows:

```typescript
import { WIN32 } from '@socketsecurity/lib/constants/platform'
const home = getHome() || (WIN32 ? process.env.USERPROFILE : undefined)
```

And use `path.join()` for cross-platform path construction:

```typescript
import path from 'node:path'
const configPath = path.join(home, '.myapp', 'config.json')
```
