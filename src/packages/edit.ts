/**
 * @fileoverview Editable package.json manipulation utilities.
 *
 * Convenience wrappers around the `EditablePackageJson` class for the
 * two common shapes: "I have a plain object, give me an editable" and
 * "I have a path, load it as editable (sync or async)."
 *
 *   - `EditablePackageJsonInstance` — public interface for instances
 *   - `pkgJsonToEditable` — wrap an in-memory PackageJson object
 *   - `toEditablePackageJson` — async path-based load
 *   - `toEditablePackageJsonSync` — sync path-based load
 *
 * The class factory lives in a sibling leaf and is re-exported here
 * so existing `packages/edit` importers keep working unchanged:
 *
 *   - `getEditablePackageJsonClass` — `./edit-class`
 *
 * Lazy `node:fs` / `node:path` / `node:util` loaders use the canonical
 * `getNodeFs` / `getNodePath` / `getNodeUtil` helpers from
 * `@socketsecurity/lib/node/{fs,path,util}`.
 */

import { JSONStringify } from '../primordials/json'

import { isNodeModules } from '../paths/normalize'
import { resolvePackageJsonDirname } from '../paths/packages'

import { getEditablePackageJsonClass } from './edit-class'
import { normalizePackageJson } from './normalize'

import type {
  EditablePackageJsonOptions,
  NormalizeOptions,
  PackageJson,
  SaveOptions,
} from './types'

/**
 * EditablePackageJson instance interface extending NPMCliPackageJson functionality.
 * Provides enhanced package.json manipulation with Socket-specific features.
 * @extends NPMCliPackageJson (from @npmcli/package-json)
 */
export interface EditablePackageJsonInstance {
  /**
   * The parsed package.json content as a readonly object.
   * @readonly
   */
  content: Readonly<PackageJson>

  /**
   * Create a new package.json file at the specified path.
   * @param path - The directory path where package.json will be created
   */
  create(path: string): this

  /**
   * Apply automatic fixes to the package.json based on npm standards.
   * @param opts - Optional fix configuration
   */
  fix(opts?: unknown | undefined): Promise<this>

  /**
   * Initialize the instance from a content object.
   * @param content - The package.json content object
   */
  fromContent(content: unknown): this

  /**
   * Initialize the instance from a JSON string.
   * @param json - The package.json content as a JSON string
   */
  fromJSON(json: string): this

  /**
   * Load a package.json file from the specified path.
   * @param path - The directory containing the package.json
   * @param create - Whether to create the file if it doesn't exist
   */
  load(path: string, create?: boolean): Promise<this>

  /**
   * Normalize the package.json content according to npm standards.
   * @param opts - Normalization options
   */
  normalize(opts?: NormalizeOptions): Promise<this>

  /**
   * Prepare the package.json for publishing.
   * @param opts - Preparation options
   */
  prepare(opts?: unknown): Promise<this>

  /**
   * Update the package.json content with new values.
   * @param content - Partial package.json object with fields to update
   * @override from NPMCliPackageJson
   */
  update(content: Partial<PackageJson>): this

  /**
   * Save the package.json file to disk.
   * @param options - Save options for formatting and sorting
   * @override from NPMCliPackageJson
   */
  save(options?: SaveOptions | undefined): Promise<boolean>

  /**
   * Synchronously save the package.json file to disk.
   * @param options - Save options for formatting and sorting
   */
  saveSync(options?: SaveOptions | undefined): boolean

  /**
   * Check if the package.json will be saved based on current changes.
   * @param options - Save options to evaluate
   */
  willSave(options?: SaveOptions | undefined): boolean
}

/**
 * Convert a package.json object to an editable instance.
 *
 * @example
 * ```typescript
 * const editable = pkgJsonToEditable({ name: 'my-pkg', version: '1.0.0' })
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function pkgJsonToEditable(
  pkgJson: PackageJson,
  options?: EditablePackageJsonOptions,
): unknown {
  const { normalize, ...normalizeOptions } = {
    __proto__: null,
    ...options,
  } as EditablePackageJsonOptions
  const EditablePackageJson = getEditablePackageJsonClass()
  return new EditablePackageJson().fromContent(
    normalize ? normalizePackageJson(pkgJson, normalizeOptions) : pkgJson,
  )
}

/**
 * Convert package.json to editable instance with file persistence.
 *
 * @example
 * ```typescript
 * const editable = await toEditablePackageJson(
 *   { name: 'my-pkg', version: '1.0.0' },
 *   { path: '/tmp/my-project' }
 * )
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export async function toEditablePackageJson(
  pkgJson: PackageJson,
  options?: EditablePackageJsonOptions,
): Promise<unknown> {
  const { path: filepath, ...pkgJsonToEditableOptions } = {
    __proto__: null,
    ...options,
  }
  const { normalize, ...normalizeOptions } = pkgJsonToEditableOptions
  if (typeof filepath !== 'string') {
    return pkgJsonToEditable(pkgJson, pkgJsonToEditableOptions)
  }
  const EditablePackageJson = getEditablePackageJsonClass()
  const pkgJsonPath = resolvePackageJsonDirname(filepath)
  return (
    await EditablePackageJson.load(pkgJsonPath, { create: true })
  ).fromJSON(
    `${JSONStringify(
      normalize
        ? normalizePackageJson(pkgJson, {
            ...(isNodeModules(pkgJsonPath) ? {} : { preserve: ['repository'] }),
            ...normalizeOptions,
          })
        : pkgJson,
      undefined,
      2,
    )}\n`,
  )
}

/**
 * Convert package.json to editable instance with file persistence synchronously.
 *
 * @example
 * ```typescript
 * const editable = toEditablePackageJsonSync(
 *   { name: 'my-pkg', version: '1.0.0' },
 *   { path: '/tmp/my-project' }
 * )
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function toEditablePackageJsonSync(
  pkgJson: PackageJson,
  options?: EditablePackageJsonOptions,
): unknown {
  const { path: filepath, ...pkgJsonToEditableOptions } = {
    __proto__: null,
    ...options,
  }
  const { normalize, ...normalizeOptions } = pkgJsonToEditableOptions
  if (typeof filepath !== 'string') {
    return pkgJsonToEditable(pkgJson, pkgJsonToEditableOptions)
  }
  const EditablePackageJson = getEditablePackageJsonClass()
  const pkgJsonPath = resolvePackageJsonDirname(filepath)
  return new EditablePackageJson().create(pkgJsonPath).fromJSON(
    `${JSONStringify(
      normalize
        ? normalizePackageJson(pkgJson, {
            ...(isNodeModules(pkgJsonPath) ? {} : { preserve: ['repository'] }),
            ...normalizeOptions,
          })
        : pkgJson,
      undefined,
      2,
    )}\n`,
  )
}

// Re-exports — preserve the historical `packages/edit` surface so
// downstream importers don't have to chase the split. The lazy
// `node:fs` / `node:path` / `node:util` loaders were removed: use the
// canonical `getNodeFs` / `getNodePath` / `getNodeUtil` from
// `@socketsecurity/lib/node/{fs,path,util}` instead.
export { getEditablePackageJsonClass } from './edit-class'
