# quality-scan Reference Documentation

## Agent Prompts

### Critical Scan Agent

**Mission**: Identify critical bugs that could cause crashes, data corruption, or security vulnerabilities.

**Scan Targets**: All `.ts` files in `src/`

**Prompt Template:**
```
Your task is to perform a critical bug scan on socket-lib, Socket Security's core infrastructure library. Identify bugs that could cause crashes, data corruption, or security vulnerabilities.

<context>
This is Socket Security's shared utilities library used by all Socket.dev tools:
- **HTTP Client**: Implements retry logic and request handling (src/http-request.ts)
- **File System**: File operations, JSON reading/writing, safe deletion (src/fs.ts)
- **Spawn**: Process spawning with cross-platform support (src/spawn.ts)
- **Logger**: Colored terminal output with symbols (src/logger.ts)
- **Environment**: Typed environment variable access (src/env/*.ts)
- **Paths**: Cross-platform path utilities (src/paths/*.ts)

Key characteristics:
- Uses TypeScript compiled to CommonJS via esbuild
- Must work cross-platform (Windows, macOS, Linux)
- Exports named functions (no default exports)
- Uses null-prototype objects pattern: `{ __proto__: null, ...props }`
- Provides ESM interop annotations for Node.js compatibility
- Core library - bugs here affect all downstream tools
</context>

<instructions>
Scan all code files for these critical bug patterns:
- TypeScript: src/**/*.ts, scripts/**/*.mjs
- Focus on:

<pattern name="null_undefined_access">
- Property access without optional chaining when value might be null/undefined
- Array access without length validation (arr[0], arr[arr.length-1])
- JSON.parse() without try-catch
- Object destructuring without null checks
</pattern>

<pattern name="unhandled_promises">
- Async function calls without await or .catch()
- Promise.then() chains without .catch() handlers
- Fire-and-forget promises that could reject
- Missing error handling in async/await blocks
</pattern>

<pattern name="race_conditions">
- Concurrent file system operations without coordination
- Check-then-act patterns without atomic operations
- Shared state modifications in Promise.all()
</pattern>

<pattern name="type_coercion">
- Equality comparisons using == instead of ===
- Implicit type conversions that could fail silently
- Truthy/falsy checks where explicit null/undefined checks needed
- typeof checks that miss edge cases (typeof null === 'object')
</pattern>

<pattern name="resource_leaks">
- File handles opened but not closed (missing .close() or using())
- Timers created but not cleared (setTimeout/setInterval)
- Event listeners added but not removed
- Child processes spawned but not properly cleaned up
</pattern>

<quality_guidelines>
For each potential issue found, use explicit chain-of-thought reasoning with `<thinking>` tags:

<thinking>
1. Can this actually crash/fail in production?
   - Code path analysis: [describe the execution flow]
   - Production scenarios: [real-world conditions]
   - Result: [yes/no with justification]

2. What input would trigger this issue?
   - Trigger conditions: [specific inputs/states]
   - Edge cases: [boundary conditions]
   - Likelihood: [HIGH/MEDIUM/LOW]

3. Are there existing safeguards I'm missing?
   - Defensive code: [try-catch, validation, guards]
   - Framework protections: [built-in safety]
   - Result: [SAFEGUARDED/VULNERABLE]

Overall assessment: [REPORT/SKIP]
Decision: [If REPORT, include in findings. If SKIP, explain why it's a false positive]
</thinking>

Only report issues that pass all three checks. Use `<thinking>` tags to show your reasoning explicitly.
</quality_guidelines>
</instructions>

<output_format>
For each finding, report:

File: src/path/to/file.ts:lineNumber
Issue: [One-line description of the bug]
Severity: Critical
Pattern: [The problematic code snippet]
Trigger: [What input/condition causes the bug]
Fix: [Specific code change to fix it]
Impact: [What happens if this bug is triggered]

Example:
File: src/http-request.ts:145
Issue: Unhandled promise rejection in HTTP request
Severity: Critical
Pattern: `httpRequest(url, options)`
Trigger: When network request fails without error handler
Fix: `await httpRequest(url, options).catch(err => { throw new Error(\`HTTP request failed: \${err.message}\`, { cause: err }) })`
Impact: Uncaught exception crashes consuming application

Example:
File: src/fs.ts:234
Issue: Potential null pointer access on file read
Severity: Critical
Pattern: `const data = JSON.parse(content)`
Trigger: When file contains invalid JSON
Fix: `try { return JSON.parse(content) } catch (e) { throw new Error(\`Invalid JSON in \${filePath}: \${e.message}\`, { cause: e }) }`
Impact: TypeError crashes library when reading malformed JSON files
</output_format>

<quality_guidelines>
- Only report actual bugs, not style issues or minor improvements
- Verify bugs are not already handled by surrounding code
- Prioritize bugs affecting library reliability and consumer applications
- Focus on promise handling, type guards, external input validation
- Skip false positives (TypeScript type guards are sufficient in many cases)
- Focus on src/ (library source) and scripts/ (build scripts)
</quality_guidelines>

Scan systematically through src/ and scripts/ directories and report all critical bugs found. If no critical bugs are found, state that explicitly.
```

---

### Logic Scan Agent

**Mission**: Detect logical errors in utility functions, algorithms, and data processing that could produce incorrect results.

**Scan Targets**: All `src/**/*.ts` files

**Prompt Template:**
```
Your task is to detect logic errors in socket-lib that could cause incorrect behavior, wrong outputs, or subtle bugs. Focus on algorithm correctness, edge case handling, and data validation.

<context>
socket-lib is Socket Security's core infrastructure library:
- **HTTP Client**: Request/response handling, retry logic (src/http-request.ts)
- **File System**: File operations, path handling, JSON utilities (src/fs.ts)
- **Spawn**: Process execution, output handling (src/spawn.ts)
- **Strings**: Text manipulation, formatting (src/strings.ts)
- **Arrays/Objects**: Collection utilities (src/arrays.ts, src/objects.ts)
- **Paths**: Cross-platform path normalization (src/paths/*.ts)

Critical operations:
- HTTP request building and retry logic
- JSON parsing and file reading
- Cross-platform path normalization
- Environment variable parsing
- Version comparison and semver handling
</context>

<instructions>
Analyze all source files for these logic error patterns:

<pattern name="off_by_one">
Off-by-one errors in loops and slicing:
- Loop bounds: `i <= arr.length` should be `i < arr.length`
- Slice operations: `arr.slice(0, len-1)` when full array needed
- String indexing missing first/last character
- lastIndexOf() checks that miss position 0
</pattern>

<pattern name="type_guards">
Insufficient type validation:
- `if (obj)` allows 0, "", false - use `obj != null` or explicit checks
- `if (arr.length)` crashes if arr is undefined - check existence first
- `typeof x === 'object'` true for null and arrays - use Array.isArray() or null check
- Missing validation before destructuring or property access
</pattern>

<pattern name="edge_cases">
Unhandled edge cases in string/array operations:
- `str.split('.')[0]` when delimiter might not exist
- `parseInt(str)` without NaN validation
- `lastIndexOf('@')` returns -1 if not found, === 0 is valid (e.g., '@package')
- Empty strings, empty arrays, single-element arrays
- Malformed input handling (missing try-catch, no fallback)
</pattern>

<pattern name="algorithm_correctness">
Algorithm implementation issues:
- Version comparison: Failing on semver edge cases (prerelease, build metadata)
- Path resolution: Symlink handling, relative vs absolute path logic
- String operations: Unicode handling, encoding issues
- Retry logic: Incorrect backoff calculations
</pattern>

<pattern name="cross_platform">
Cross-platform compatibility issues:
- Path separators: Using / on Windows or \ on Unix
- Line endings: \n vs \r\n handling
- Case sensitivity: File path comparisons
- Environment variables: Different naming conventions
</pattern>

<quality_guidelines>
For each potential issue found, use explicit chain-of-thought reasoning with `<thinking>` tags:

<thinking>
1. Can this actually produce wrong results in production?
   - Code path analysis: [describe the execution flow]
   - Production scenarios: [real-world conditions]
   - Result: [yes/no with justification]

2. What input would trigger this issue?
   - Trigger conditions: [specific inputs/states]
   - Edge cases: [boundary conditions]
   - Likelihood: [HIGH/MEDIUM/LOW]

3. Are there existing safeguards I'm missing?
   - Defensive code: [try-catch, validation, guards]
   - Framework protections: [built-in safety]
   - Result: [SAFEGUARDED/VULNERABLE]

Overall assessment: [REPORT/SKIP]
Decision: [If REPORT, include in findings. If SKIP, explain why it's a false positive]
</thinking>

Only report issues that pass all three checks. Use `<thinking>` tags to show your reasoning explicitly.
</quality_guidelines>
</instructions>

<output_format>
For each finding, report:

File: src/path/to/file.ts:lineNumber
Issue: [One-line description]
Severity: High | Medium
Edge Case: [Specific input that triggers the error]
Pattern: [The problematic code snippet]
Fix: [Corrected code]
Impact: [What incorrect output is produced]

Example:
File: src/http-request.ts:89
Issue: Off-by-one in retry attempt counting
Severity: High
Edge Case: When max retries is set to 0
Pattern: `for (let i = 0; i < retries - 1; i++)`
Fix: `for (let i = 0; i <= retries; i++)`
Impact: Library retries one fewer time than configured

Example:
File: src/paths/normalize.ts:45
Issue: Path normalization fails on Windows UNC paths
Severity: High
Edge Case: When path starts with \\\\server\\share
Pattern: `path.replace(/\\\\/g, '/')`
Fix: `normalizePath(path)` using path.normalize() first
Impact: UNC paths become invalid, file operations fail
</output_format>

<quality_guidelines>
- Prioritize code handling external data (file paths, environment variables, user input)
- Focus on errors affecting correctness and cross-platform compatibility
- Verify logic errors aren't false alarms due to type narrowing
- Consider real-world edge cases: empty values, malformed input, platform differences
- Pay special attention to string/array operations and path handling
</quality_guidelines>

Analyze systematically across src/ and report all logic errors found. If no errors are found, state that explicitly.
```

---

### Workflow Scan Agent

**Mission**: Detect problems in build scripts, CI configuration, and developer workflows.

**Scan Targets**: `scripts/`, `package.json`, `.github/workflows/*`

**Prompt Template:**
```
Your task is to identify issues in socket-lib's development workflows, build scripts, and CI configuration that could cause build failures, test flakiness, or poor developer experience.

<context>
socket-lib is a TypeScript library with:
- **Build scripts**: scripts/**/*.mjs (ESM, cross-platform Node.js)
- **Package manager**: pnpm with scripts in package.json
- **CI**: GitHub Actions (.github/workflows/)
- **Platforms**: Must work on Windows, macOS, Linux
- **CLAUDE.md**: Defines conventions (no process.exit(), named exports only, etc.)
- **Build**: esbuild compiles TypeScript to CommonJS with ESM interop annotations

Components:
- Library source: src/ (TypeScript files)
- Build scripts: scripts/ (Node.js ESM)
- Tests: test/ (Vitest test files)
- Output: dist/ (CommonJS with .d.ts)
</context>

<instructions>
Analyze workflow files for these issue categories:

<pattern name="scripts_cross_platform">
Cross-platform compatibility in scripts/*.mjs:
- Path separators: Hardcoded / or \ instead of path.join() or path.resolve()
- Shell commands: Platform-specific (e.g., rm vs del, cp vs copy)
- Line endings: \n vs \r\n handling in text processing
- File paths: Case sensitivity differences (Windows vs Linux)
- Environment variables: Different syntax (%VAR% vs $VAR)
</pattern>

<pattern name="scripts_errors">
Error handling in scripts:
- process.exit() usage: CLAUDE.md forbids this - should throw errors instead
- Missing try-catch: Async operations without error handling
- Exit codes: Non-zero exit on failure for CI detection
- Error messages: Are they helpful for debugging?
- Dependency checks: Do scripts check for required tools before use?

**Note on file existence checks**: existsSync() is ACCEPTABLE and actually PREFERRED over async fs.access() for synchronous file checks. Do NOT flag existsSync() as an issue.
</pattern>

<pattern name="package_json_scripts">
package.json script correctness:
- Script chaining: Use && (fail fast) not ; (continue on error) when errors matter
- Platform-specific: Commands that don't work cross-platform (grep, find, etc.)
- Convention compliance: Match patterns in CLAUDE.md (e.g., `pnpm run foo --flag` not `foo:bar`)
- Missing scripts: Standard scripts like build, test, lint documented?
</pattern>

<pattern name="ci_configuration">
CI pipeline issues:
- Build order: Are steps in correct sequence (install -> build -> test)?
- Cross-platform: Are Windows/macOS/Linux builds all tested?
- Node versions: Are supported Node.js versions tested (20, 22, 24)?
- Caching: Is pnpm cache properly configured?
- Failure notifications: Are build failures clearly visible?
- Build artifacts: Are dist files validated?
</pattern>

<pattern name="build_output">
Build output validation:
- ESM interop annotations: Are they present in all dist/*.js files?
- Type definitions: Are .d.ts files generated for all exports?
- Package exports: Does package.json exports match dist/ structure?
- Named exports: No default exports (CLAUDE.md requirement)
</pattern>

<quality_guidelines>
For each potential issue found, use explicit chain-of-thought reasoning with `<thinking>` tags:

<thinking>
1. Can this actually cause build/CI failures?
   - Code path analysis: [describe the execution flow]
   - CI scenarios: [when would this fail]
   - Result: [yes/no with justification]

2. What triggers this issue?
   - Trigger conditions: [specific scenarios]
   - Platform differences: [Windows/macOS/Linux]
   - Likelihood: [HIGH/MEDIUM/LOW]

3. Are there existing safeguards I'm missing?
   - Defensive code: [error handling, fallbacks]
   - CI protections: [matrix testing, caching]
   - Result: [SAFEGUARDED/VULNERABLE]

Overall assessment: [REPORT/SKIP]
Decision: [If REPORT, include in findings. If SKIP, explain why it's a false positive]
</thinking>

Only report issues that pass all three checks. Use `<thinking>` tags to show your reasoning explicitly.
</quality_guidelines>
</instructions>

<output_format>
For each finding, report:

File: [scripts/foo.mjs:line OR package.json:scripts.build OR .github/workflows/ci.yml:line]
Issue: [One-line description]
Severity: Medium | Low
Impact: [How this affects developers or CI]
Pattern: [The problematic code or configuration]
Fix: [Specific change to resolve]

Example:
File: scripts/build/main.mjs:23
Issue: Uses process.exit() violating CLAUDE.md convention
Severity: Medium
Impact: Cannot be tested properly, unconventional error handling
Pattern: `process.exit(1)`
Fix: `throw new Error('Build failed: ...')`

Example:
File: package.json:scripts.test
Issue: Script chaining uses semicolon instead of &&
Severity: Medium
Impact: Tests run even if build fails, masking build issues
Pattern: `"test": "pnpm build ; pnpm vitest"`
Fix: `"test": "pnpm build && pnpm vitest"`
</output_format>

<quality_guidelines>
- Focus on issues that cause actual build/test failures
- Consider cross-platform scenarios (Windows, macOS, Linux)
- Verify conventions match CLAUDE.md requirements
- Prioritize developer experience issues (confusing errors, missing docs)
</quality_guidelines>

Analyze workflow files systematically and report all issues found. If workflows are well-configured, state that explicitly.
```

---

### Security Scan Agent

**Mission**: Scan GitHub Actions workflows for security vulnerabilities using zizmor.

**Scan Targets**: All `.yml` files in `.github/workflows/`

**Prompt Template:**
```
Your task is to run the zizmor security scanner on GitHub Actions workflows to identify security vulnerabilities such as template injection, cache poisoning, and other workflow security issues.

<context>
Zizmor is a GitHub Actions workflow security scanner that detects:
- Template injection vulnerabilities (code injection via template expansion)
- Cache poisoning attacks (artifacts vulnerable to cache poisoning)
- Credential exposure in workflow logs
- Dangerous workflow patterns and misconfigurations
- OIDC token abuse risks
- Artipacked vulnerabilities

This repository uses GitHub Actions for CI/CD with workflows in `.github/workflows/`.

**Installation:**
Zizmor is not available via npm. Install using one of these methods:

**GitHub Releases (Recommended):**
```bash
# macOS ARM64:
curl -L https://github.com/zizmorcore/zizmor/releases/latest/download/zizmor-aarch64-apple-darwin -o /usr/local/bin/zizmor
chmod +x /usr/local/bin/zizmor

# macOS x64:
curl -L https://github.com/zizmorcore/zizmor/releases/latest/download/zizmor-x86_64-apple-darwin -o /usr/local/bin/zizmor
chmod +x /usr/local/bin/zizmor

# Linux x64:
curl -L https://github.com/zizmorcore/zizmor/releases/latest/download/zizmor-x86_64-unknown-linux-musl -o /usr/local/bin/zizmor
chmod +x /usr/local/bin/zizmor
```

**Alternative Methods:**
- Homebrew: `brew install zizmor`
- Cargo: `cargo install zizmor`
</context>

<instructions>
1. Run zizmor on all GitHub Actions workflow files:
   ```bash
   zizmor .github/workflows/
   ```

2. Parse the zizmor output and identify all findings:
   - Extract severity level (info, low, medium, high, error)
   - Extract vulnerability type (template-injection, cache-poisoning, etc.)
   - Extract file path and line numbers
   - Extract audit confidence level
   - Note if auto-fix is available

3. For each finding, report:
   - File and line number
   - Vulnerability type and severity
   - Description of the security issue
   - Why it's a problem (security impact)
   - Suggested fix (use zizmor's suggestions if available)
   - Whether auto-fix is available (`zizmor --fix`)

4. If zizmor reports no findings, state explicitly: "✓ No security issues found in GitHub Actions workflows"

5. Note any suppressed findings (shown by zizmor but marked as suppressed)
</instructions>

<pattern name="template_injection">
Look for findings like:
- `info[template-injection]` or `error[template-injection]`
- Code injection via template expansion in run blocks
- Unsanitized use of `${{ }}` syntax in dangerous contexts
- User-controlled input used in shell commands
</pattern>

<pattern name="cache_poisoning">
Look for findings like:
- `error[cache-poisoning]` or `warning[cache-poisoning]`
- Caching enabled when publishing artifacts
- Vulnerable to cache poisoning attacks in release workflows
</pattern>

<pattern name="credential_exposure">
Look for findings like:
- Secrets logged to console
- Credentials passed in insecure ways
- Token leakage through workflow logs
</pattern>

<output_format>
For each finding, output in this structured format:

File: .github/workflows/workflow-name.yml:123
Issue: [Vulnerability description]
Severity: High | Medium | Low
Pattern: [The problematic workflow code]
Trigger: [What enables the vulnerability]
Fix: [Specific workflow change]
Impact: [Security consequence]
Auto-fix: [Yes/No]

Example:
File: .github/workflows/ci.yml:45
Issue: Template injection in run block
Severity: High
Pattern: `echo "Comment: ${{ github.event.comment.body }}"`
Trigger: Untrusted PR comment body injected into shell command
Fix: Use environment variable: `env: COMMENT: ${{ github.event.comment.body }}` then `echo "Comment: $COMMENT"`
Impact: Attacker can execute arbitrary commands in CI
Auto-fix: Available (`zizmor --fix`)
</output_format>

<quality_guidelines>
- Only report actual zizmor findings (don't invent issues)
- Include all details from zizmor output
- Note the audit confidence level for each finding
- Indicate if auto-fix is available
- If no findings, explicitly state the workflows are secure
- Report suppressed findings separately
</quality_guidelines>
```

---

### Documentation Scan Agent

**Mission**: Verify documentation accuracy by checking README files and examples against actual codebase implementation.

**Scan Targets**: All README.md files, CLAUDE.md, and documentation files

**Prompt Template:**
```
Your task is to verify documentation accuracy across all README files and documentation by comparing documented behavior, examples, commands, and API descriptions against the actual codebase implementation.

<context>
Documentation accuracy is critical for:
- Developer onboarding and productivity
- Preventing confusion from outdated examples
- Maintaining trust in the project documentation
- Reducing support burden from incorrect instructions

Common documentation issues:
- Package names that don't match package.json
- Command examples with incorrect flags or options
- API documentation showing methods that don't exist
- File paths that are incorrect or outdated
- Export names that don't match actual exports
- Configuration examples using deprecated formats
- Missing documentation for new features
- Examples that would fail if run as-is
</context>

<instructions>
Systematically verify all README files and documentation against the actual code:

1. **Find all documentation files**:
   - README.md (root)
   - CLAUDE.md (conventions)
   - docs/*.md (if exists)

2. **For each README, verify**:
   - Package name matches package.json "name" field
   - Command examples use correct flags (check scripts in package.json)
   - Import examples use correct export names (check src/ exports)
   - File paths exist and match actual structure
   - Build output paths match actual build script outputs
   - API examples match actual exported functions/types
   - Version numbers are current (not outdated)

3. **Check against actual code**:
   - Read package.json to verify names, scripts, dependencies
   - Read source files to verify APIs, exports, types
   - Check build scripts to verify output paths
   - Check tests to see what's actually supported

4. **Pattern categories to check**:

<pattern name="package_names">
Look for:
- README showing @scope/package when package.json has different scope
- Installation instructions with wrong package names
- Import examples using wrong package names
</pattern>

<pattern name="command_examples">
Look for:
- Commands with flags that don't exist (check package.json scripts)
- Missing required flags in examples
- Deprecated flags still documented
- Examples that would error if run as-is
</pattern>

<pattern name="api_documentation">
Look for:
- Functions documented that don't exist in exports
- Parameter types that don't match actual implementation
- Return types incorrectly documented
- Missing required parameters in examples
- Examples using deprecated APIs
</pattern>

<pattern name="file_paths">
Look for:
- Documented paths that don't exist in codebase
- Output paths that don't match build script outputs
- Config file locations that are incorrect
- Source file references that are outdated
</pattern>

<pattern name="missing_documentation">
Look for:
- Public APIs/exports not documented in README
- Important environment variables not documented
- New features added but not documented
</pattern>

<quality_guidelines>
For each potential issue found, use explicit chain-of-thought reasoning with `<thinking>` tags:

<thinking>
1. Does this documentation actually mislead users?
   - Verification: [how I verified against actual code]
   - User impact: [what happens if user follows this]
   - Result: [MISLEADING/ACCURATE]

2. How severe is this inaccuracy?
   - Error type: [would fail/wrong behavior/confusing]
   - Likelihood user encounters: [HIGH/MEDIUM/LOW]
   - Severity: [High/Medium/Low]

3. Is this a false positive?
   - Alternative interpretations: [could this be intentional]
   - Context: [is there related documentation]
   - Result: [REPORT/SKIP]

Overall assessment: [REPORT/SKIP]
Decision: [If REPORT, include in findings. If SKIP, explain why]
</thinking>

Only report issues that pass all three checks. Use `<thinking>` tags to show your reasoning explicitly.
</quality_guidelines>
</instructions>

<output_format>
For each finding, report:

File: path/to/README.md:lineNumber
Issue: [One-line description of the documentation error]
Severity: High/Medium/Low
Pattern: [The incorrect documentation text]
Actual: [What the correct information should be]
Fix: [Exact documentation correction needed]
Impact: [Why this matters - confusion, errors, etc.]

Severity Guidelines:
- High: Critical inaccuracies that would cause errors if followed (wrong commands, non-existent APIs)
- Medium: Outdated information that misleads but doesn't immediately break (wrong paths, old examples)
- Low: Minor inaccuracies or missing non-critical information

Example:
File: README.md:25
Issue: Incorrect import example
Severity: High
Pattern: `import { httpGetJson } from '@socketsecurity/lib/http-request'`
Actual: Function is named `httpJson`, not `httpGetJson`
Fix: Change to: `import { httpJson } from '@socketsecurity/lib/http-request'`
Impact: Import fails with "Named export 'httpGetJson' not found" error
</output_format>

<quality_guidelines>
- Verify every claim against actual code - don't assume documentation is correct
- Read package.json to check names, scripts, versions
- Check exports in source files to verify APIs
- Focus on high-impact errors first (wrong commands, non-existent APIs)
- Provide exact fixes, not vague suggestions
</quality_guidelines>

Scan all README.md files and documentation and report all inaccuracies found. If documentation is accurate, state that explicitly.
```

---

### ESM/CJS Interop Scan Agent

**Mission**: Verify Node.js ESM/CJS interoperability for the library, ensuring named exports work correctly when imported from ESM code.

**Scan Targets**: All `dist/*.js` files and `package.json` exports configuration

**Prompt Template:**
```
Your task is to verify ESM/CJS interoperability for socket-lib, ensuring that ESM code can properly import named exports from the CommonJS modules.

<context>
Node.js 22+ has stricter ESM/CJS interoperability requirements. When ESM code imports a CommonJS module using:

```javascript
import { namedExport } from '@socketsecurity/lib/module'
```

Node.js uses static analysis to detect named exports from the CJS module. This works when:
1. The CJS module has ESM interop annotations (esbuild's `0 && (module.exports = {...})`)
2. The package.json exports field properly maps modules
3. Named exports are used (not default exports)

**The ESM interop annotation is critical:**
```javascript
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  functionA,
  functionB,
  functionC
})
```

This annotation at the end of each CJS file tells Node.js which named exports are available, enabling `import { functionA } from 'package'` syntax.

Common interop failures:
- Missing ESM interop annotation in dist/*.js files
- Annotation lists different exports than actual module.exports
- CJS module uses `module.exports = value` instead of object with named exports
- package.json exports missing "types" condition before "default"
- Default export confusion: module only exports `{ default: value }`

socket-lib architecture:
- TypeScript source compiled to CommonJS via esbuild
- esbuild adds ESM interop annotations automatically
- package.json exports field maps subpath imports
- Type definitions (.d.ts) generated alongside .js files
- Named exports pattern required (no default exports per CLAUDE.md)
</context>

<instructions>
Verify ESM/CJS interoperability across the package:

<pattern name="esm_interop_annotation">
Check dist/*.js files for ESM interop annotations:
- ✓ GOOD: File ends with `0 && (module.exports = { export1, export2, ... })`
- ✗ BAD: Missing annotation entirely
- ✗ BAD: Annotation lists exports that don't match actual exports
- ✗ BAD: Annotation is malformed or incomplete

Verify the annotation exists and matches actual exports:
```javascript
// Expected pattern at end of file:
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  httpDownload,
  httpJson,
  httpRequest,
  httpText
});
```
</pattern>

<pattern name="cjs_export_format">
Check that modules use proper named exports pattern:
- ✓ GOOD: `module.exports = __toCommonJS(exports)` with ESM annotation
- ✓ GOOD: `__export(exports, { foo: () => foo, bar: () => bar })`
- ✗ BAD: `module.exports = singleValue` - Cannot destructure named imports
- ✗ BAD: `module.exports.default = value` - Only default export available
</pattern>

<pattern name="package_json_exports">
Check package.json exports field for proper configuration:
- Each export should have "types" before "default" (TypeScript resolution)
- Export paths should match actual dist file structure
- No duplicate exports for same file
- Verify exported files actually exist in dist/

Example of correct exports:
```json
"./module": {
  "types": "./dist/module.d.ts",
  "default": "./dist/module.js"
}
```
</pattern>

<pattern name="type_definitions">
Check .d.ts files match .js exports:
- Every named export in .js should have corresponding type declaration
- Type exports should use `export declare function/const/class`
- No `export default` in type definitions (breaks CJS interop)
</pattern>

<pattern name="actual_esm_import_test">
Test actual ESM imports work (run via node -e):
```bash
# Test named import
node -e "import { exportName } from './dist/module.js'; console.log(typeof exportName)"

# List available exports
node -e "import('./dist/module.js').then(m => console.log(Object.keys(m).filter(k => k !== 'default')))"
```

Common errors to detect:
- "Named export 'X' not found" - Export doesn't exist or annotation missing
- Module has only `default` in exports (synthetic default from CJS)
</pattern>

<quality_guidelines>
For each potential issue found, use explicit chain-of-thought reasoning with `<thinking>` tags:

<thinking>
1. Does this actually break ESM imports?
   - Test the import: [actual node command or code analysis]
   - Error message: [what error would users see]
   - Result: [BREAKS/WORKS]

2. What's the user-facing symptom?
   - Import statement: [what user would write]
   - Expected behavior: [what should happen]
   - Actual behavior: [what happens]
   - Likelihood: [HIGH/MEDIUM/LOW - how common is this import pattern]

3. Is there a workaround or is this blocking?
   - Workaround: [alternative import syntax if any]
   - Severity: [BLOCKING - no workaround / DEGRADED - has workaround]

Overall assessment: [REPORT/SKIP]
Decision: [If REPORT, include in findings. If SKIP, explain why it's a false positive]
</thinking>

Only report issues that actually break ESM imports. Use `<thinking>` tags to show your reasoning explicitly.
</quality_guidelines>
</instructions>

<output_format>
For each finding, report:

File: dist/module.js or package.json:exports
Issue: [One-line description of the interop problem]
Severity: Critical | High | Medium
Import: [The import statement that fails]
Error: [The error message users would see]
Pattern: [The problematic code or config]
Fix: [Specific change to resolve]
Impact: [User-facing consequence]

Severity Guidelines:
- Critical: Named imports completely broken (SyntaxError, module not found)
- High: Named imports require workaround (import default then destructure)
- Medium: Type definitions don't match exports (TypeScript errors only)

Example:
File: dist/legacy-api.js
Issue: Missing ESM interop annotation
Severity: Critical
Import: `import { legacyHelper } from '@socketsecurity/lib/legacy-api'`
Error: "Named export 'legacyHelper' not found. The requested module is a CommonJS module, which may not support all module.exports as named exports."
Pattern: File missing `0 && (module.exports = { legacyHelper })` annotation
Fix: Rebuild with esbuild which adds annotations automatically, or add annotation manually
Impact: Users must use workaround: `import pkg from '@socketsecurity/lib/legacy-api'; const { legacyHelper } = pkg`

Example:
File: dist/http-request.js
Issue: ESM annotation missing export
Severity: High
Import: `import { httpDownload } from '@socketsecurity/lib/http-request'`
Error: "Named export 'httpDownload' not found"
Pattern: Annotation has `0 && (module.exports = { httpJson, httpRequest })` but missing httpDownload
Fix: Update build to include all exports in annotation
Impact: httpDownload not importable via named import despite being exported
</output_format>

<quality_guidelines>
- Run actual ESM import tests using node -e when possible
- Verify package.json exports against actual dist/ contents
- Check both .js and .d.ts files for each exported module
- Focus on named imports (the common pattern) over default imports
- Prioritize issues that produce runtime errors over TypeScript-only issues
- Test on Node.js 22+ which has stricter interop requirements
- The ESM interop annotation is THE key thing to verify
</quality_guidelines>

Scan all exported modules and verify ESM/CJS interoperability. Report all issues found. If all exports work correctly with the ESM interop annotations present, state that explicitly.
```

---

## Scan Configuration

### Severity Levels

| Level | Description | Action Required |
|-------|-------------|-----------------|
| **Critical** | Crashes, security vulnerabilities, data corruption | Fix immediately |
| **High** | Logic errors, incorrect output, ESM interop broken | Fix before release |
| **Medium** | Performance issues, edge case bugs | Fix in next sprint |
| **Low** | Code smells, minor inconsistencies | Fix when convenient |

### Scan Priority Order

1. **critical** - Most important, run first
2. **logic** - Utility correctness critical for all consumers
3. **esm-interop** - Named imports must work for all consumers
4. **external-bundles** - Vendored dependencies must be self-contained
5. **workflow** - Build and CI stability
6. **security** - GitHub Actions security
7. **documentation** - Developer experience

### Coverage Targets

- **critical**: All src/*.ts files
- **logic**: src/ utilities, path handling, HTTP client
- **esm-interop**: All dist/*.js files, package.json exports
- **external-bundles**: dist/external/*.js, package.json overrides/catalog
- **workflow**: scripts/, package.json, .github/workflows/
- **security**: .github/workflows/*.yml
- **documentation**: README.md, CLAUDE.md, docs/

---

## Report Format

### Structured Findings

Each finding should include:
```typescript
{
  file: "src/http-request.ts:89",
  issue: "Missing ESM interop annotation",
  severity: "Critical",
  scanType: "esm-interop",
  pattern: "File ends without 0 && (module.exports = {...})",
  fix: "Rebuild with esbuild or add annotation manually",
  impact: "Named imports fail for this module"
}
```

### Example Report Output

```markdown
# Quality Scan Report

**Date:** 2026-03-02
**Scans:** critical, logic, esm-interop, workflow
**Files Scanned:** 144
**Findings:** 0 critical, 1 high, 2 medium, 1 low

## High Issues (Priority 2) - 1 found

### dist/deprecated-module.js
- **Issue**: Missing ESM interop annotation
- **Pattern**: File ends without `0 && (module.exports = {...})` annotation
- **Fix**: Remove deprecated module or rebuild with esbuild
- **Impact**: Named imports fail: `import { helper } from '@socketsecurity/lib/deprecated-module'`
- **Scan**: esm-interop

## Medium Issues (Priority 3) - 2 found

### src/paths/normalize.ts:45
- **Issue**: Path normalization inconsistent on Windows
- **Edge Case**: UNC paths starting with \\\\
- **Pattern**: `path.replace(/\\\\/g, '/')`
- **Fix**: Use path.normalize() before replacing separators
- **Impact**: UNC paths become invalid

### scripts/build/main.mjs:23
- **Issue**: Uses process.exit() violating CLAUDE.md convention
- **Pattern**: `process.exit(1)`
- **Fix**: `throw new Error('Build failed: ...')`
- **Impact**: Cannot test error handling properly

## Scan Coverage
- **Critical scan**: 89 files analyzed in src/
- **Logic scan**: 89 files analyzed
- **ESM interop scan**: 144 dist files analyzed
- **Workflow scan**: 15 scripts + package.json + CI workflows

## Verified Working
- ESM interop annotations present in all 144 dist/*.js files
- All 100+ package.json exports have matching dist files
- Named imports verified working for key modules

## Recommendations
1. Address high-severity ESM interop issue before release
2. Fix path normalization edge case for Windows users
3. Update build script to use throw instead of process.exit()
```

---

### External Bundles Scan Agent

**Mission**: Verify vendored external dependencies in dist/external/ are properly bundled without hidden requires to node_modules, check for duplicate bundled code, and ensure pnpm overrides/catalog are used for deduplication.

**Scan Targets**: `dist/external/*.js`, `package.json` (dependencies, overrides, catalog)

**Prompt Template:**
```
Your task is to verify the integrity of vendored external dependencies in socket-lib, ensuring bundles are self-contained without hidden requires to node_modules packages, checking for duplicate bundled code, and verifying pnpm overrides/catalog are used for deduplication.

<context>
socket-lib vendors external npm packages into dist/external/ as zero-dependency bundles. This allows:
- Consumers to use these packages without installing them directly
- Consistent versions across all Socket.dev tools
- Reduced dependency tree complexity

**How external bundles work:**
- Source type definitions: src/external/*.d.ts
- Built bundles: dist/external/*.js (esbuild bundled, zero external deps)
- Build script: scripts/build-externals/ (esbuild bundling)

**What bundles should contain:**
- All dependencies fully inlined (no require() to node_modules packages)
- Only Node.js built-ins allowed as external requires (node:fs, node:path, etc.)
- ESM interop annotations for named exports

**What bundles should NOT contain:**
- require("package-name") where package-name is in node_modules
- require("which"), require("debug"), etc. - these should be bundled inline
- Duplicate code that could be shared via pnpm overrides

**pnpm deduplication:**
- pnpm.overrides in package.json forces specific versions
- pnpm.catalog (pnpm-workspace.yaml) provides workspace-wide version catalog
- Deduplication reduces bundle sizes and ensures consistency
</context>

<instructions>
Verify external bundle integrity across these categories:

<pattern name="hidden_requires">
Check dist/external/*.js for require() calls to non-bundled packages:

**Allowed requires (Node.js built-ins):**
- require("node:fs"), require("node:path"), require("node:url"), etc.
- require("fs"), require("path"), require("os"), require("crypto"), etc.
- require("stream"), require("events"), require("child_process"), etc.
- require("module") for builtinModules

**Forbidden requires (should be bundled):**
- require("which") - external package, must be bundled
- require("debug") - external package, must be bundled
- require("semver") - external package, must be bundled
- require("any-npm-package") - all external deps must be inlined

**Detection method:**
```bash
# Find require() calls that are NOT node built-ins and NOT __commonJS wrappers
grep -n 'require("' dist/external/*.js | \
  grep -v 'node_modules/.pnpm' | \
  grep -v 'node:' | \
  grep -v '__require' | \
  grep -v '__commonJS' | \
  grep -v 'require("fs' | \
  grep -v 'require("path' | \
  grep -v 'require("os' | \
  grep -v 'require("url' | \
  grep -v 'require("crypto' | \
  grep -v 'require("stream' | \
  grep -v 'require("events' | \
  grep -v 'require("child_process' | \
  grep -v 'require("module'
```

Any remaining require() calls are potentially problematic.
</pattern>

<pattern name="duplicate_bundles">
Check for code that's bundled multiple times across external bundles:

**Detection:**
- Same package bundled in multiple dist/external/*.js files
- Large shared dependencies (semver, debug, etc.) appearing multiple times
- Bundle size analysis showing unnecessary duplication

**Check bundle sizes:**
```bash
ls -la dist/external/*.js | sort -k5 -n
```

Large bundles (>100KB) may indicate unnecessary duplication.

**Check for common duplicated packages:**
- semver (version comparison)
- debug (logging)
- which (executable finding)
- signal-exit (exit handling)

If same package appears in multiple bundles, consider:
1. Creating shared bundle (e.g., npm-pack.js exports semver for others)
2. Using re-export pattern: `const { semver } = require('./npm-pack')`
</pattern>

<pattern name="pnpm_overrides">
Check package.json pnpm.overrides for deduplication:

**What to verify:**
- Common transitive dependencies have overrides to force single version
- Overrides match versions in devDependencies
- No conflicting versions that could cause issues

**Example good overrides:**
```json
"pnpm": {
  "overrides": {
    "semver": "7.7.2",
    "debug": "4.4.3",
    "which": "5.0.0",
    "signal-exit": "4.1.0"
  }
}
```

**Check for missing overrides:**
Look at transitive dependencies that might have multiple versions:
```bash
pnpm ls --depth 3 | grep -E "semver|debug|which|signal-exit"
```

Multiple versions of same package = needs override.
</pattern>

<pattern name="pnpm_catalog">
Check for pnpm catalog usage (workspace-wide version management):

**Location:** pnpm-workspace.yaml (if exists)
**Purpose:** Define versions once, use across workspace

**Example catalog:**
```yaml
catalog:
  semver: 7.7.2
  debug: 4.4.3
```

**Benefits:**
- Single source of truth for versions
- Automatic deduplication
- Easier updates
</pattern>

<pattern name="bundle_exports">
Check that external bundles are properly exported in package.json:

**For each dist/external/*.js file:**
1. Should have corresponding export in package.json
2. Should have type definitions (dist/external/*.d.ts or src/external/*.d.ts)
3. ESM interop annotation should be present

**Check package.json exports for externals:**
Look for missing exports where dist/external/foo.js exists but no ./external/foo export.
</pattern>

<quality_guidelines>
For each potential issue found, use explicit chain-of-thought reasoning with `<thinking>` tags:

<thinking>
1. Is this actually a problem?
   - Require target: [what package is being required]
   - Is it a Node.js built-in: [yes/no]
   - Should it be bundled: [yes/no with reason]
   - Result: [PROBLEM/OK]

2. What's the impact?
   - Runtime error: [would this cause require() to fail at runtime]
   - Bundle size: [unnecessary duplication impact]
   - Consistency: [version mismatch risks]
   - Severity: [Critical/High/Medium/Low]

3. Is there an existing solution?
   - Already in overrides: [check package.json]
   - Already shared via re-export: [check bundle structure]
   - Result: [NEEDS_FIX/ALREADY_HANDLED]

Overall assessment: [REPORT/SKIP]
Decision: [If REPORT, include in findings. If SKIP, explain why]
</thinking>

Only report issues that would cause runtime errors or significant bundle bloat.
</quality_guidelines>
</instructions>

<output_format>
For each finding, report:

File: dist/external/bundle-name.js:lineNumber (or package.json)
Issue: [One-line description]
Severity: Critical | High | Medium
Category: hidden-require | duplicate-bundle | missing-override | missing-export
Pattern: [The problematic code or configuration]
Fix: [Specific change to resolve]
Impact: [User-facing consequence]

Severity Guidelines:
- Critical: Hidden require that will fail at runtime (package not in node_modules)
- High: Significant duplicate bundling (>50KB duplicated) or missing override causing version conflicts
- Medium: Minor duplication or missing catalog entry

Example - Hidden Require:
File: dist/external/npm-pack.js:10115
Issue: Hidden require to unbundled 'which' package
Severity: Critical
Category: hidden-require
Pattern: `var which = require("which")`
Fix: Add 'which' to esbuild bundle configuration or mark as external with peer dependency
Impact: Runtime error "Cannot find module 'which'" when package is used without which installed

Example - Duplicate Bundle:
File: dist/external/pacote.js, dist/external/npm-pack.js
Issue: 'semver' bundled in both files (~25KB each)
Severity: Medium
Category: duplicate-bundle
Pattern: Both bundles contain full semver implementation
Fix: Export semver from npm-pack.js, use re-export in pacote.js: `const { semver } = require('./npm-pack')`
Impact: ~25KB unnecessary bundle size increase

Example - Missing Override:
File: package.json
Issue: No pnpm override for 'debug' causing multiple versions
Severity: High
Category: missing-override
Pattern: pnpm ls shows debug@4.3.4 and debug@4.4.3 in tree
Fix: Add `"debug": "4.4.3"` to pnpm.overrides
Impact: Inconsistent debug versions, potential bundle duplication
</output_format>

<quality_guidelines>
- Run actual grep/find commands to detect hidden requires
- Check bundle sizes to identify duplication
- Verify pnpm ls output for version conflicts
- Focus on issues causing runtime errors (Critical) over bundle size (Medium)
- Consider re-export pattern as preferred fix for duplication
- Node.js built-ins are always allowed (don't flag require("fs"))
</quality_guidelines>

Scan all external bundles and verify integrity. Report all issues found. If all bundles are properly self-contained, state that explicitly.
```

### Example External Bundles Scan Output

```markdown
## External Bundles Issues - 3 found

### Critical Severity - 1 issue

#### dist/external/npm-pack.js:10115
- **Issue**: Hidden require to unbundled 'which' package
- **Category**: hidden-require
- **Pattern**: `var which = require("which")` (line 10115, 10939)
- **Fix**: Add 'which' to esbuild bundle entry points or use existing dist/external/which.js
- **Impact**: Runtime error if consumer doesn't have 'which' installed

### High Severity - 1 issue

#### package.json
- **Issue**: Missing pnpm override for 'lru-cache'
- **Category**: missing-override
- **Pattern**: pnpm ls shows lru-cache@7.18.3 and lru-cache@11.2.2
- **Fix**: Add `"lru-cache": "11.2.2"` to pnpm.overrides
- **Impact**: Potential version conflicts and bundle duplication

### Medium Severity - 1 issue

#### dist/external/pacote.js + dist/external/cacache.js
- **Issue**: 'ssri' implementation duplicated in both bundles
- **Category**: duplicate-bundle
- **Pattern**: Both contain ~15KB of ssri code
- **Fix**: Create dist/external/ssri.js and use re-export pattern
- **Impact**: ~15KB unnecessary bundle size

### ✓ Verified Working

The following aspects passed validation:
- 45 external bundles have ESM interop annotations
- All external bundles have corresponding package.json exports
- Node.js built-in requires are properly used (node:fs, node:path, etc.)
- pnpm.overrides covers 16 common dependencies

### Deduplication Recommendations

Consider adding these to pnpm.overrides for better deduplication:
- minipass (used by cacache, pacote, make-fetch-happen)
- @npmcli/fs (used by multiple npm packages)
- proc-log (used by npm ecosystem packages)
```
