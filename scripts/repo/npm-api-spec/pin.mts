/**
 * @file The committed pin for npm's published OpenAPI source, and the paths
 *   that reach the fetched copy of it.
 *   npm renders its API docs from https://github.com/npm/api-documentation. The
 *   rendered site's "Download openapi.json" button is a `blob:` URL built by
 *   the page's own JavaScript after load, so it exists only inside a live
 *   browser tab and cannot be fetched by a script. The git source can, so this
 *   is what we track.
 *   The spec is not one file: `api/merge-config.yaml` lists the inputs a
 *   redocly `join` folds into the published document. We read those same inputs
 *   directly rather than shelling out to redocly, so the only dependency is a
 *   YAML parser.
 *   Pinned by COMMIT SHA, never by `main`, per the fleet's immutable-references
 *   doctrine: a branch name serves different bytes tomorrow under an unchanged
 *   reference. `spec-pin.json` records the sha, the human label beside it, and
 *   a `sha256:` digest per input file, so a re-fetch that returns different
 *   bytes for the same sha is a loud failure instead of a silent swap.
 */

import crypto from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { REPO_CACHE_DIR, REPO_ROOT } from '../../fleet/paths.mts'

/**
 * The GitHub repository that holds npm's OpenAPI source.
 */
export const SPEC_REPO = 'npm/api-documentation'

/**
 * The branch the pin advances along. Recorded in the pin's label so a reader
 * knows which line the sha was taken from.
 */
export const SPEC_BRANCH = 'main'

/**
 * The merge manifest inside the spec repo. Its `inputs[].inputFile` list is the
 * authoritative set of files that compose the published document, so the
 * fetcher reads this first rather than hard-coding a file list that would go
 * stale the moment npm splits another tag out.
 */
export const SPEC_MERGE_CONFIG_PATH = 'api/merge-config.yaml'

/**
 * Where the pin lives. Committed, so a fetch is reproducible and auditable
 * from the tree alone.
 */
export const SPEC_PIN_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'repo',
  'npm-api-spec',
  'spec-pin.json',
)

/**
 * Where the generated endpoint inventory lives. Committed, marked generated,
 * never hand-edited: it is the offline projection of the pinned spec that lets
 * the drift check run with no network at all.
 */
export const SPEC_INVENTORY_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'repo',
  'npm-api-spec',
  'spec-inventory.generated.json',
)

/**
 * Where fetched spec bytes are cached. Under the repo-owned cache segment, so
 * it never dirties the worktree - see
 * docs/agents.md/fleet/runtime-state-and-caches.md ("Known state stores").
 * Clear it with `rm -rf .cache/repo/npm-api-spec`.
 */
export const SPEC_CACHE_DIR = path.join(REPO_CACHE_DIR, 'npm-api-spec')

/**
 * One input file of the spec, with the digest its bytes must hash to.
 */
export interface SpecPinFile {
  readonly integrity: string
  readonly path: string
}

/**
 * The committed pin.
 *
 * `refLabel` is the human half of the reference, spelled `<branch> <date>` per
 * the branch-pin form in docs/agents.md/fleet/immutable-references.md. JSON has
 * no comments, so the label rides a sibling key.
 */
export interface SpecPin {
  readonly files: readonly SpecPinFile[]
  readonly generatedBy: string
  readonly refLabel: string
  readonly repo: string
  readonly sha: string
}

/**
 * Which pin file to read or write. Tests point this at a scratch file.
 */
export interface SpecPinPathOptions {
  pinPath?: string | undefined
}

/**
 * The `sha256:<hex>` digest of `bytes`, in the one checksum vocabulary the
 * fleet writes on every surface.
 */
export function digestOf(bytes: string | Uint8Array): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

/**
 * True when `value` is a 40-character lowercase hex commit sha. A short sha or
 * a branch name is a mutable pointer and must never reach the pin.
 */
export function isFullCommitSha(value: string): boolean {
  return value.length === 40 && /^[0-9a-f]+$/.test(value)
}

/**
 * The committed pin, or undefined when it has not been written yet.
 *
 * Fails soft rather than throwing: the check treats a missing pin as "nothing
 * to compare against yet" and says so, which is more useful than a stack trace
 * on a fresh checkout of a branch that predates the pin.
 */
export function readSpecPin(
  options?: SpecPinPathOptions | undefined,
): SpecPin | undefined {
  const opts = { __proto__: null, ...options } as SpecPinPathOptions
  const pinPath = opts.pinPath ?? SPEC_PIN_PATH
  let text: string
  try {
    text = readFileSync(pinPath, 'utf8')
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined
  }
  const pin = parsed as Partial<SpecPin>
  if (typeof pin.sha !== 'string' || !Array.isArray(pin.files)) {
    return undefined
  }
  return pin as SpecPin
}

/**
 * The label for a pin taken from `branch` on `date` - `main 2026-08-25`.
 */
export function refLabelFor(branch: string, date: Date): string {
  return `${branch} ${date.toISOString().slice(0, 10)}`
}

/**
 * Write the pin, newline-terminated and two-space indented so it diffs the way
 * every other committed JSON in this repo does.
 */
export function writeSpecPin(
  pin: SpecPin,
  options?: SpecPinPathOptions | undefined,
): void {
  const opts = { __proto__: null, ...options } as SpecPinPathOptions
  const pinPath = opts.pinPath ?? SPEC_PIN_PATH
  writeFileSync(pinPath, `${JSON.stringify(pin, undefined, 2)}\n`)
}
