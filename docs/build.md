# Build Architecture

Socket Lib's build system optimizes for zero runtime dependencies while supporting vendored packages.

## 🎯 Core Concept

```
┌────────────────────────────────────────┐
│  Production Build Strategy             │
├────────────────────────────────────────┤
│  Vendored (Bundled)   External (Deps)  │
│  ├─ socket packages   @socketregistry/ │
│  ├─ small utilities   packageurl-js    │
│  └─ type defs         (runtime dep)    │
└────────────────────────────────────────┘
```

**Goal:** Minimize runtime dependencies, maximize bundle control

## Build Pipeline

```
Source        Compile         Post-Process     Output
─────────────────────────────────────────────────────
src/          esbuild         scripts/         dist/
├─ *.ts   →   │           →   ├─ fix exports → *.js
├─ external/  │               ├─ bundle deps  → *.d.ts
└─ themes/    │               └─ validate
              ↓
           CommonJS
           ES2022
```

**Tools:**
- **esbuild** — Fast TypeScript → JavaScript compilation
- **tsgo** — Type definition generation (TypeScript Native Preview)
- **Babel AST** — Post-build transformations

## Dependency Types

### Runtime Dependencies (package.json)

```json
{
  "dependencies": {
    "@socketregistry/packageurl-js": "1.3.0"
  }
}
```

✅ **Use when:**
- Package is large or complex
- Package needs separate versioning
- Package is already a published dependency

### Vendored Dependencies (src/external/)

```
src/external/
├── @socketregistry/
│   ├── is-unicode-supported.js
│   ├── ansi-regex.js
│   └── ...
├── yoctocolors-cjs/
└── ...
```

✅ **Use when:**
- Small utility packages
- Socket-owned packages
- Tight version control needed
- Reducing dependency tree

## Import Rules

### Inside src/external/ ✅

Vendored code lives here — no bare imports allowed:

```javascript
// ✅ Correct - vendored implementation
// src/external/@socketregistry/is-unicode-supported.js
module.exports = function isUnicodeSupported() {
  // ... implementation
}
```

### Outside src/external/ ✅

Use relative paths for vendored deps:

```typescript
// ✅ Correct
import isUnicodeSupported from '../external/@socketregistry/is-unicode-supported'

// ❌ Wrong - bare imports not allowed
import isUnicodeSupported from '@socketregistry/is-unicode-supported'
```

### Runtime Dependencies ✅

Only allowed dependencies use bare imports:

```typescript
// ✅ Correct - runtime dependency
import { PackageURL } from '@socketregistry/packageurl-js'
```

## Build Commands

```bash
# Full build
pnpm run build

# Individual steps
pnpm run build:js        # Compile TypeScript → JavaScript
pnpm run build:types     # Generate .d.ts files
pnpm run build:externals # Bundle external dependencies
pnpm run fix:exports     # Fix CommonJS exports

# Development
pnpm run dev             # Watch mode
pnpm run clean           # Remove dist/
```

## Build Scripts

All build scripts are Node.js modules (`.mjs`):

```
scripts/
├── build.mjs                    # Main build orchestrator
├── build-js.mjs                 # esbuild JavaScript compilation
├── build-externals.mjs          # Bundle external dependencies
├── fix-commonjs-exports.mjs     # Post-build CommonJS fixes
├── fix-default-imports.mjs      # Fix default import patterns
└── babel/
    └── transform-*.mjs          # AST transformations
```

**No shell scripts (`.sh`)** — Node.js only for cross-platform compatibility.

## Post-Build Transformations

### CommonJS Export Fixes

TypeScript compiles `export default X` to `exports.default = X`, requiring `.default` accessor. We fix this:

```javascript
// Before (TypeScript output)
exports.default = WIN32

// After (our fix)
module.exports = WIN32
```

This allows cleaner imports:

```javascript
// ✅ After fix
const WIN32 = require('./WIN32')

// ❌ Before fix
const WIN32 = require('./WIN32').default
```

### External Bundling

Vendored dependencies are bundled during build:

```javascript
// Build bundles src/external/* → dist/external/*
// Preserves module structure for selective imports
```

## Validation

`scripts/validate-external.mjs` ensures:

✅ All `src/external/` packages are properly vendored (no bare imports)
✅ Only allowed runtime dependencies are used
✅ No accidental external package imports

```bash
pnpm run validate:externals
```

## Adding Dependencies

### Adding a Runtime Dependency

```bash
# 1. Install package
pnpm add @socketregistry/new-package

# 2. Add to allowed list in scripts/validate-external.mjs
const ALLOWED_EXTERNAL_PACKAGES = [
  '@socketregistry/packageurl-js',
  '@socketregistry/new-package',  // ← Add here
]

# 3. Use in code with bare import
import { Thing } from '@socketregistry/new-package'

# 4. Validate
pnpm run validate:externals
```

### Vendoring a Package

```bash
# 1. Copy package source to src/external/
mkdir -p src/external/@socketregistry/my-util
cp node_modules/@socketregistry/my-util/index.js src/external/@socketregistry/my-util/

# 2. Import with relative path
import myUtil from '../external/@socketregistry/my-util'

# 3. Build will bundle it
pnpm run build

# 4. Validate
pnpm run validate:externals
```

## Performance

### Build Times

| Step | Time | Tool |
|------|------|------|
| Clean | ~10ms | fs.rm |
| JavaScript | ~1.6s | esbuild |
| Types | ~2s | tsgo |
| Externals | ~200ms | esbuild |
| Post-process | ~100ms | Babel AST |
| **Total** | **~4s** | |

### Optimization Strategies

- **Parallel builds** — JavaScript and types compile concurrently
- **Incremental** — Only rebuild changed files in watch mode
- **Native tools** — esbuild (Go), tsgo (Rust) for speed
- **No bundling** — Preserve module structure (faster than Rollup)

## Build Output

```
dist/
├── constants/
│   ├── packages.js
│   ├── packages.d.ts
│   └── ...
├── env/
│   ├── ci.js
│   ├── ci.d.ts
│   └── ...
├── external/
│   ├── @socketregistry/
│   └── ...
├── effects/
├── stdio/
├── themes/
└── ... (matches src/ structure)
```

**Format:** CommonJS (`.js`) + TypeScript definitions (`.d.ts`)

**Target:** ES2022 (Node.js 20+)

## Troubleshooting

### Build Fails

```bash
# Check build output
pnpm run build

# Try clean build
pnpm run clean && pnpm run build
```

**Common Issues:**
- Missing `dist/` directory → Run `pnpm run build`
- TypeScript errors → Run `pnpm run check`
- Path alias issues → Check `tsconfig.json` paths

### Validation Errors

```bash
pnpm run validate:externals
```

**Common Issues:**
- Bare import in wrong place → Use relative path
- Unapproved dependency → Add to ALLOWED_EXTERNAL_PACKAGES
- Missing vendored file → Copy to `src/external/`

### Watch Mode Not Working

```bash
# Stop existing watch process
# Kill any running pnpm dev

# Restart watch
pnpm run dev
```

## Advanced: Babel Transformations

Socket Lib uses Babel AST + magic-string for post-build transformations.

**Pattern:**
1. Parse with Babel → Get AST
2. Walk with Babel traverse → Find nodes
3. Edit with magic-string → Surgical changes
4. Preserve source maps → magic-string maintains mappings

**Available Transforms:**
- `transform-commonjs-exports.mjs` — Fix `exports.default`
- See `scripts/babel/README.md` for details

## References

- [esbuild Documentation](https://esbuild.github.io/)
- [tsgo Repository](https://github.com/microsoft/TypeScript/tree/main/src/tsgo)
- [Babel Parser](https://babeljs.io/docs/babel-parser)

---

**Back to:** [Getting Started](./getting-started.md) · [README](../README.md)
