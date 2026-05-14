/**
 * @fileoverview `parseYarnDescriptor(descriptor)` — extracts the
 * package name from a yarn lockfile spec key.
 *
 * Spec formats handled:
 *   - Yarn Classic: `name@^1.0.0` → `name`
 *   - Berry npm: `name@npm:^1.0.0` → `name`
 *   - Berry workspace: `name@workspace:^1.0.0` → `name`
 *   - Berry patch: `patch:name@npm:1.0.0#…` → `name`
 *   - Berry patch (encoded): `patch:name@npm%3A1.0.0#…` → `name`
 *   - Scoped: `@scope/name@^1.0.0` → `@scope/name`
 *
 * Matches socket-btm's smol-manifest internal `parseYarnDescriptor`.
 */

import {
  StringPrototypeIndexOf,
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
} from '../../../../primordials/string'

export interface YarnDescriptor {
  readonly name: string
}

const PATCH_PREFIX = 'patch:'
const PATCH_PREFIX_LEN = PATCH_PREFIX.length
const NPM_PROTO = '@npm:'
const NPM_PROTO_ENCODED = '@npm%3A'
const WORKSPACE_PROTO = '@workspace:'

export function parseYarnDescriptor(descriptor: string): YarnDescriptor {
  if (StringPrototypeIndexOf(descriptor, PATCH_PREFIX) === 0) {
    const afterPatch = StringPrototypeSlice(descriptor, PATCH_PREFIX_LEN)
    let npmIndex = StringPrototypeIndexOf(afterPatch, NPM_PROTO)
    const npmEncodedIndex = StringPrototypeIndexOf(
      afterPatch,
      NPM_PROTO_ENCODED,
    )
    const workspaceIndex = StringPrototypeIndexOf(afterPatch, WORKSPACE_PROTO)
    if (
      npmEncodedIndex > 0 &&
      (npmIndex === -1 || npmEncodedIndex < npmIndex)
    ) {
      npmIndex = npmEncodedIndex
    }
    if (npmIndex > 0) {
      return { name: StringPrototypeSlice(afterPatch, 0, npmIndex) }
    }
    if (workspaceIndex > 0) {
      return { name: StringPrototypeSlice(afterPatch, 0, workspaceIndex) }
    }
  }

  let protocolIndex = StringPrototypeIndexOf(descriptor, NPM_PROTO)
  if (protocolIndex > 0) {
    return { name: StringPrototypeSlice(descriptor, 0, protocolIndex) }
  }

  protocolIndex = StringPrototypeIndexOf(descriptor, WORKSPACE_PROTO)
  if (protocolIndex > 0) {
    return { name: StringPrototypeSlice(descriptor, 0, protocolIndex) }
  }

  const atIdx = StringPrototypeLastIndexOf(descriptor, '@')
  if (atIdx > 0) {
    return { name: StringPrototypeSlice(descriptor, 0, atIdx) }
  }
  return { name: descriptor }
}
