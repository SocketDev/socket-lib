/**
 * @file Build-time collapse of vendored Node engine gates that are dead on
 *   every supported runtime. Vendored packages ship userland fallbacks behind
 *   runtime version checks — @npmcli/fs's cp module gates `useNative =
 *   node.satisfies('>=16.7.0')` and keeps a full fs.cp polyfill alive for the
 *   false branch. With our engines.node floor well above such gates, the check
 *   is always true, the polyfill is unreachable, and the gate's `node` helper
 *   binding is exactly the kind of indirection downstream bundlers mangle into
 *   require-time crashes — packageurl-js's dist/exists.js broke on
 *   `node.satisfies is not a function`. This rolldown `transform` plugin
 *   rewrites the gate to `true` BEFORE bundling and drops the then-unused
 *   `common/node.js` helper require, so the class disappears from
 *   dist/external for every consumer. The polyfill module itself is swapped
 *   for a throw stub via STUB_MAP in rolldown-config.mts. The supported range
 *   comes from package.json engines.node — never hardcoded here — and a gate
 *   is only collapsed when the whole engines range is a semver subset of the
 *   gate range, so a future re-vendor that raises a gate ABOVE our floor is
 *   left intact instead of silently forced true.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

// oxlint-disable-next-line socket/prefer-lib-versions-over-semver -- build-time-only transform; needs semver.subset + Range floors, which versions/* does not expose, and scripts never ship to consumers.
import semver from 'semver'

import type { Plugin } from 'rolldown'

// Fleet-wide support floor. Engine gates at or below this are dead code in
// every fleet repo; a package.json engines.node below it is a config bug this
// build should fail loudly on, not silently honor.
const FLEET_NODE_FLOOR = '18.0.0'

// The @npmcli/fs helper-binding shape: `const node = require('../common/node.js')`.
// The gate rewrite only runs in files that bind this helper, so an unrelated
// `node.satisfies(...)` (e.g. an AST node) can never be touched.
const NODE_HELPER_REQUIRE_RE =
  /^[ \t]*const node = require\((['"])[^'"]*common\/node\.js\1\)[ \t]*;?[ \t]*\r?\n?/m

// Matches `node.satisfies('<range>')` gate calls: `(['"])` captures the
// opening quote, `([^'"]+)` captures the range literal, and the `\1`
// backreference requires the closing quote to match the opening one.
const NODE_SATISFIES_RE = /\bnode\.satisfies\(\s*(['"])([^'"]+)\1\s*\)/g

/**
 * Read package.json engines.node from `rootDir` and assert its floor is at or
 * above the fleet support floor.
 *
 * @throws When engines.node is missing/invalid or its minimum version is
 *   below the fleet floor.
 */
export function readSupportedNodeRange(rootDir: string): string {
  const pkgPath = path.join(rootDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    engines?: { node?: string | undefined } | undefined
  }
  const range = pkg.engines?.node
  if (typeof range !== 'string' || !semver.validRange(range)) {
    throw new Error(
      `collapse-engine-gates: ${pkgPath} engines.node is missing or not a valid semver range: ${String(range)}`,
    )
  }
  const floor = semver.minVersion(range)
  if (!floor || semver.lt(floor, FLEET_NODE_FLOOR)) {
    throw new Error(
      `collapse-engine-gates: engines.node "${range}" has floor ${String(floor)} ` +
        `below the fleet support floor ${FLEET_NODE_FLOOR}; ` +
        'collapsing vendored engine gates would be unsound',
    )
  }
  return range
}

/**
 * Collapse below-floor `node.satisfies('<range>')` gates in one module's
 * source. Returns the rewritten code, or `undefined` when the module doesn't
 * bind the @npmcli/fs `common/node.js` helper or no gate is implied by
 * `supportedRange`. Gates whose range is NOT implied by the engines range
 * (e.g. a future `>=99` check) are left intact. When every `node.` use is
 * collapsed, the helper require is dropped too, removing the binding that
 * downstream bundlers have mangled.
 */
export function collapseEngineGates(
  code: string,
  supportedRange: string,
): string | undefined {
  if (!NODE_HELPER_REQUIRE_RE.test(code)) {
    return undefined
  }
  let collapsed = 0
  let out = code.replace(NODE_SATISFIES_RE, (match, _quote, gateRange) => {
    try {
      if (semver.subset(supportedRange, gateRange as string)) {
        collapsed += 1
        return 'true'
      }
    } catch {
      // Not a valid range comparison — leave the gate untouched.
    }
    return match
  })
  if (collapsed === 0) {
    return undefined
  }
  // Drop `const node = require('.../common/node.js')` when no `node.` member
  // access survives outside the require line itself. Conservative: any
  // remaining use keeps the require.
  const withoutRequire = out.replace(NODE_HELPER_REQUIRE_RE, '')
  if (!/\bnode\.[$_a-zA-Z]/.test(withoutRequire)) {
    out = withoutRequire
  }
  return out
}

/**
 * Rolldown plugin wiring for {@link collapseEngineGates}. Only touches
 * modules under node_modules — checked-in src/external entry files are
 * hand-authored and never carry the vendored helper shape.
 */
export function createCollapseEngineGatesPlugin(
  supportedRange: string,
): Plugin {
  return {
    name: 'collapse-engine-gates',
    transform(code: string, id: string) {
      if (!id.includes('node_modules') || !code.includes('common/node.js')) {
        return undefined
      }
      const rewritten = collapseEngineGates(code, supportedRange)
      return rewritten === undefined ? undefined : { code: rewritten }
    },
  }
}
