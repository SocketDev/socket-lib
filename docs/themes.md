# Theme System

Socket Lib provides a comprehensive theming system for consistent branding and styling across spinners, text effects, links, prompts, and logger output.

## Quick Start

```typescript
import { setTheme, Spinner } from '@socketsecurity/lib'

// Set global theme
setTheme('socket-firewall')

// All components use the theme
const spinner = Spinner({ text: 'Scanning packages...' })
spinner.start()
```

## Core Concepts

### Themes

A theme defines colors and visual effects for all Socket CLI components:

- **Colors**: Primary/secondary brand colors, semantic colors (success, error, warning, info), UI colors (text, links, prompts)
- **Effects**: Spinner styles, shimmer animations, pulse effects

### Theme Stack

Themes use a stack-based model for temporary theme changes:

```typescript
import { pushTheme, popTheme } from '@socketsecurity/lib/themes'

pushTheme('ultra')        // Switch to ultra theme
// ... operations with ultra theme ...
popTheme()                // Restore previous theme
```

### Scoped Themes

Use `withTheme()` for automatic cleanup:

```typescript
import { withTheme } from '@socketsecurity/lib/themes'

await withTheme('coana', async () => {
  // All operations use coana theme
  const spinner = Spinner({ text: 'Processing...' })
  spinner.start()
  await heavyOperation()
  spinner.stop()
})
// Theme automatically restored
```

## Default Themes

Socket Lib includes five product-specific themes:

### Socket Security (default)
```typescript
setTheme('socket')
```
**Colors**: Purple primary (#8C52FF), standard semantic colors
**Effects**: Socket spinner style, subtle shimmer

### Coana
```typescript
setTheme('coana')
```
**Colors**: Blue primary, cyan secondary, professional palette
**Effects**: Dot spinner, clean animations

### Socket Firewall
```typescript
setTheme('socket-firewall')
```
**Colors**: Orange/amber warning colors, security-focused
**Effects**: Security-themed spinner, warning emphasis

### Socket CLI Python
```typescript
setTheme('socket-cli-python')
```
**Colors**: Python blue/yellow, language-specific branding
**Effects**: Python-themed styling

### Ultra
```typescript
setTheme('ultra')
```
**Colors**: Rainbow gradients for all elements
**Effects**: Rainbow shimmer, enhanced animations, maximum visual flair

## API Reference

### Theme Management

#### `setTheme(theme)`
Set the global theme.

```typescript
import { setTheme } from '@socketsecurity/lib/themes'

// By name
setTheme('socket-firewall')

// By object
setTheme(customTheme)
```

#### `getTheme()`
Get the current theme.

```typescript
import { getTheme } from '@socketsecurity/lib/themes'

const theme = getTheme()
console.log(theme.displayName)  // "Socket Security"
```

#### `pushTheme(theme)` / `popTheme()`
Stack-based theme management.

```typescript
import { pushTheme, popTheme } from '@socketsecurity/lib/themes'

pushTheme('ultra')
// ... operations ...
popTheme()  // Back to previous
```

#### `withTheme(theme, fn)`
Execute async operation with temporary theme.

```typescript
import { withTheme } from '@socketsecurity/lib/themes'

await withTheme('coana', async () => {
  // Coana theme active here
  await doWork()
})
// Previous theme restored
```

#### `withThemeSync(theme, fn)`
Execute sync operation with temporary theme.

```typescript
import { withThemeSync } from '@socketsecurity/lib/themes'

const result = withThemeSync('socket-firewall', () => {
  return processData()
})
```

### Custom Themes

#### `createTheme(config)`
Create a new theme from scratch.

```typescript
import { createTheme } from '@socketsecurity/lib/themes'

const myTheme = createTheme({
  name: 'my-theme',
  displayName: 'My Theme',
  colors: {
    primary: [255, 100, 200],
    success: 'green',
    error: 'red',
    warning: 'yellow',
    info: 'blue',
    step: 'cyan',
    text: 'white',
    textDim: 'gray',
    link: 'cyanBright',
    prompt: 'primary'
  }
})

setTheme(myTheme)
```

#### `extendTheme(base, overrides)`
Extend an existing theme with overrides.

```typescript
import { extendTheme, SOCKET_THEME } from '@socketsecurity/lib/themes'

const customTheme = extendTheme(SOCKET_THEME, {
  name: 'custom-socket',
  colors: {
    primary: [200, 100, 255]  // Different purple
  },
  effects: {
    shimmer: {
      enabled: true,
      color: 'rainbow'
    }
  }
})
```

### Color References

Colors can be specified as:

- **Named colors**: `'red'`, `'green'`, `'cyan'`, `'magenta'`, etc.
- **RGB tuples**: `[255, 100, 50]`
- **Theme references**: `'primary'`, `'secondary'`
- **Special values**: `'rainbow'`, `'inherit'`

```typescript
colors: {
  primary: [140, 82, 255],     // RGB
  secondary: [100, 200, 255],  // RGB
  success: 'green',            // Named
  link: 'primary',             // Reference
  prompt: 'secondary'          // Reference
}
```

### Event Listeners

#### `onThemeChange(listener)`
React to theme changes.

```typescript
import { onThemeChange } from '@socketsecurity/lib/themes'

const unsubscribe = onThemeChange((theme) => {
  console.log('Theme changed to:', theme.displayName)
  updateUI(theme)
})

// Later: stop listening
unsubscribe()
```

## Integration

### Spinners

Spinners automatically use theme colors and styles:

```typescript
import { Spinner, setTheme } from '@socketsecurity/lib'

setTheme('ultra')
const spinner = Spinner({ text: 'Processing...' })
spinner.start()  // Uses ultra theme (rainbow)
```

Override theme for specific spinner:

```typescript
// Note: Direct theme integration coming soon
const spinner = Spinner({
  text: 'Processing...',
  color: [255, 100, 50]  // Override theme color
})
```

### Logger

Logger symbols use theme colors:

```typescript
import { logger, setTheme } from '@socketsecurity/lib'

setTheme('socket-firewall')
logger.success('Scan complete')  // Uses firewall theme colors
logger.error('Vulnerability found')
```

### Links

Create themed terminal links:

```typescript
import { link } from '@socketsecurity/lib/links'

// Uses current theme
console.log(link('Documentation', 'https://socket.dev'))

// Override theme
console.log(link('API Docs', 'https://api.socket.dev', {
  theme: 'coana'
}))

// Show URL fallback
console.log(link('GitHub', 'https://github.com', {
  fallback: true
}))
// Output: "GitHub (https://github.com)"
```

### Prompts

Themed interactive prompts (implementation in progress):

```typescript
import { input, confirm, select } from '@socketsecurity/lib/prompts'

// Text input
const name = await input({
  message: 'Enter your name:',
  default: 'User'
})

// Confirmation
const proceed = await confirm({
  message: 'Continue with installation?',
  default: true
})

// Selection
const choice = await select({
  message: 'Select environment:',
  choices: [
    { label: 'Development', value: 'dev' },
    { label: 'Production', value: 'prod' }
  ]
})
```

## Theme Structure

Complete theme type definition:

```typescript
type Theme = {
  name: string
  displayName: string

  colors: {
    // Brand colors
    primary: ColorValue
    secondary?: ColorValue

    // Semantic colors
    success: ColorValue
    error: ColorValue
    warning: ColorValue
    info: ColorValue
    step: ColorValue

    // UI colors
    text: ColorValue
    textDim: ColorValue
    link: ColorReference
    prompt: ColorReference
  }

  effects?: {
    spinner?: {
      color?: ColorReference
      style?: SpinnerStyle | string
    }
    shimmer?: {
      enabled?: boolean
      color?: ColorReference | ColorValue[]
      direction?: 'ltr' | 'rtl' | 'ttb' | 'btt'
      speed?: number
    }
    pulse?: {
      speed?: number
    }
  }

  meta?: {
    description?: string
    author?: string
    version?: string
  }
}
```

## Examples

### Product Branding

```typescript
import { setTheme, Spinner } from '@socketsecurity/lib'

// Socket Firewall branding
setTheme('socket-firewall')
const spinner = Spinner({ text: 'Scanning for threats...' })
spinner.start()
```

### Temporary Theme Switch

```typescript
import { withTheme, logger } from '@socketsecurity/lib'

// Main operations use default theme
logger.info('Starting scan...')

// Switch to ultra theme for exciting moment
await withTheme('ultra', async () => {
  logger.success('All packages safe!')
})

// Back to default theme
logger.info('Scan complete')
```

### Custom Product Theme

```typescript
import { createTheme, setTheme } from '@socketsecurity/lib/themes'

const myProductTheme = createTheme({
  name: 'my-product',
  displayName: 'My Product',
  colors: {
    primary: [50, 150, 250],      // Brand blue
    secondary: [255, 200, 0],     // Brand yellow
    success: 'green',
    error: 'red',
    warning: 'yellow',
    info: 'cyan',
    step: 'blue',
    text: 'white',
    textDim: 'gray',
    link: 'secondary',            // Yellow links
    prompt: 'primary'             // Blue prompts
  },
  effects: {
    spinner: {
      color: 'primary',
      style: 'dots'
    },
    shimmer: {
      enabled: true,
      color: [[50, 150, 250], [255, 200, 0]],  // Blue to yellow
      direction: 'ltr',
      speed: 0.5
    }
  },
  meta: {
    description: 'Custom theme for My Product CLI',
    author: 'My Company',
    version: '1.0.0'
  }
})

setTheme(myProductTheme)
```

### Rainbow Mode

```typescript
import { withTheme, Spinner } from '@socketsecurity/lib'

await withTheme('ultra', async () => {
  const spinner = Spinner({ text: 'MAXIMUM OVERDRIVE' })
  spinner.enableShimmer()
  spinner.start()
  await epicOperation()
  spinner.stop()
})
```

## Best Practices

1. **Set theme early**: Call `setTheme()` at application startup
2. **Use scoped themes**: Prefer `withTheme()` over manual push/pop
3. **Respect user preferences**: Allow theme selection via CLI flags
4. **Test all themes**: Verify your output looks good with each theme
5. **Use color references**: Use `'primary'`/`'secondary'` instead of hard-coding colors
6. **Document custom themes**: Add metadata to help users understand your theme

## Migration Guide

If you're using hard-coded colors in your Socket CLI tools:

### Before
```typescript
const spinner = Spinner({
  text: 'Loading...',
  color: [140, 82, 255]  // Hard-coded Socket purple
})
```

### After
```typescript
import { setTheme, Spinner } from '@socketsecurity/lib'

setTheme('socket')  // Or let user choose
const spinner = Spinner({ text: 'Loading...' })
// Uses theme colors automatically
```

## Troubleshooting

**Q: Theme changes not taking effect?**
A: Ensure you rebuild the project after modifying theme source files: `pnpm run build`

**Q: How do I know which theme is active?**
A: Use `getTheme()` to inspect the current theme:
```typescript
const theme = getTheme()
console.log(theme.name, theme.displayName)
```

**Q: Can I use custom RGB colors?**
A: Yes, specify colors as `[R, G, B]` tuples with values 0-255.

**Q: Why use theme references like 'primary'?**
A: References allow colors to adapt when themes change, providing consistent branding.

## Next Steps

- Explore the [spinner documentation](./getting-started.md#spinners) for animation options
- Review [logger documentation](./getting-started.md#logger) for output formatting
- Check [text effects documentation](./getting-started.md#effects) for shimmer and pulse

## Contributing

Found a bug or want to add a new theme? See [CLAUDE.md](../CLAUDE.md) for contribution guidelines.
