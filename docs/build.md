# Build Architecture

## Overview

Socket Lib uses a specialized architecture for dependencies to optimize bundle size and ensure clean separation between bundled and external code.

## Key Concepts

**Vendored Dependencies**: Source code copied into `src/external/` and bundled
**External Dependencies**: Listed in `dependencies` and used at runtime
**Validation**: Automated checking via `node scripts/validate-external.mjs`

## Dependency Types

### Runtime Dependencies

```json
"@socketregistry/packageurl-js": "1.3.0"
```

Separate packages that:
- Can be re-exported from `src/external/`
- Listed in ALLOWED_EXTERNAL_PACKAGES
- Required at runtime

### Vendored Dependencies (Build-time)

Other @socketregistry and @socketsecurity packages:
- Source code copied into `src/external/`
- NOT listed in dependencies
- Bundled at build time

## Import Rules

**Inside `src/external/`**: Must contain bundled/vendored code
```javascript
// src/external/@socketregistry/is-unicode-supported.js
module.exports = function isUnicodeSupported() {
  // ... implementation ...
}
```

**Outside `src/external/`**: Use relative paths
```javascript
// ✅ CORRECT
require('../external/@socketregistry/is-unicode-supported')

// ❌ WRONG
require('@socketregistry/is-unicode-supported')
```

## Validation

Run validation before build:
```bash
node scripts/validate-external.mjs
```

Detects forbidden patterns in `src/external/` (except ALLOWED_EXTERNAL_PACKAGES):
- `require('@socketregistry/package-name')`
- `require('@socketsecurity/package-name')`
- `from '@socketregistry/package-name'`
- `from '@socketsecurity/package-name'`

## Build Process

1. Validate external files (must be bundled code)
2. Copy `src/external/` to `dist/external/`
3. Rollup externalizes Node.js built-ins, node_modules, and `/external/` paths

## Common Patterns

### ✅ Correct

**Vendored code:**
```javascript
// src/external/@socketregistry/yocto-spinner.js
module.exports = function yoctoSpinner(options) {
  // ... full bundled implementation ...
}
```

**Relative import:**
```javascript
// src/lib/logger.ts
require('../external/@socketregistry/is-unicode-supported')
```

**Runtime dependency:**
```json
"dependencies": {
  "@socketregistry/packageurl-js": "1.3.0"
}
```

### ❌ Wrong

**Re-exporting in external:**
```javascript
// src/external/@socketregistry/yocto-spinner.js
module.exports = require('@socketregistry/yocto-spinner')  // WRONG
```

**Vendored package in devDependencies:**
```json
"devDependencies": {
  "@socketregistry/yocto-spinner": "1.0.24"  // WRONG - it's vendored
}
```

**Bare import outside external:**
```javascript
// src/lib/logger.ts
require('@socketregistry/is-unicode-supported')  // WRONG
```

## Troubleshooting

**"Cannot find module '@socketregistry/package-name'"**
- Should it be vendored into `src/external/` as bundled code?
- Should it be added to `dependencies` and ALLOWED_EXTERNAL_PACKAGES?

**Validation fails**
- File contains re-export instead of bundled code
- Either vendor the source directly or add to ALLOWED_EXTERNAL_PACKAGES

**How to vendor a new dependency**
1. Copy source into `src/external/@scope/package-name.js`
2. Ensure it doesn't `require()` the npm package
3. Run `pnpm run validate:external`
4. Code will bundle during build

## Why This Architecture?

1. **No Runtime Dependencies**: Vendored code eliminates external dependencies
2. **Clear Boundaries**: `src/external/` contains only bundled code
3. **Build-time Validation**: Automatic detection of re-exports
4. **Smaller Bundles**: Include only what's used
5. **Maintainability**: Clear rules for external files
