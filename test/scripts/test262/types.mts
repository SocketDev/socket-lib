/**
 * @file Shared types for the test262 subset runner.
 */

/**
 * How to install one shim over the native built-in it replaces.
 */
export interface InstallSpec {
  /**
   * The shim export's name in the built module.
   */
  export: string
  /**
   * The method's own `length`, which test262 asserts.
   */
  length: number
  /**
   * The method name test262 calls.
   */
  property: string
  /**
   * How the shim receives the call's receiver. `argument` passes it as the
   * first parameter, which is what an array shim taking the array wants.
   * `this` invokes the shim with it, which is what a `this`-generic Promise
   * static needs. Absent means the receiver is dropped.
   */
  receiverAs?: 'argument' | 'this' | undefined
  /**
   * The object the method hangs off, as a JS expression.
   */
  target: string
}

/**
 * One shim and the test262 subtrees that specify it.
 */
export interface FeatureConfig {
  dirs: string[]
  install: InstallSpec
  /**
   * Path of the built module under `dist/`.
   */
  module: string
  name: string
}

/**
 * A single test262 file's frontmatter, reduced to what the runner acts on.
 */
export interface TestMeta {
  /**
   * True when the test reports completion by printing rather than by exiting
   * cleanly, so a zero exit alone does NOT mean it passed.
   */
  async: boolean
  /**
   * `harness/` files the test needs, beyond the always-included defaults.
   */
  includes: string[]
  /**
   * True when the test expects an error rather than a clean run.
   */
  negative: boolean
  /**
   * The `[[Type]]` of the expected error, when negative.
   */
  negativeType?: string | undefined
  /**
   * True when the test must NOT run in strict mode.
   */
  noStrict: boolean
  /**
   * True when the test must run ONLY in strict mode.
   */
  onlyStrict: boolean
  /**
   * True when the test is a module rather than a script.
   */
  module: boolean
}

/**
 * One test262 file paired with its parsed frontmatter.
 */
export interface TestCase {
  /**
   * Path relative to the test262 root, used as the allowlist key.
   */
  id: string
  meta: TestMeta
  /**
   * Absolute path on disk.
   */
  path: string
  source: string
}

/**
 * What running one test produced.
 */
export interface RunResult {
  id: string
  passed: boolean
  /**
   * Combined stdout+stderr, kept only for a failure.
   */
  output: string
}

/**
 * Where a result lands once the allowlist is applied.
 */
export type Bucket =
  | 'expected-pass'
  | 'expected-fail'
  | 'unexpected-fail'
  | 'now-passing'

/**
 * A classified result.
 */
export interface Verdict {
  bucket: Bucket
  id: string
  output: string
}

/**
 * The whole run, ready to format.
 */
export interface Summary {
  verdicts: Verdict[]
  /**
   * Allowlist entries that matched no test in this run.
   */
  staleAllowlist: string[]
}
