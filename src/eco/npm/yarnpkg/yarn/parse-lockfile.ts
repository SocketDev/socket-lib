/**
 * @fileoverview `parseYarnLock(content)` — parses a `yarn.lock`
 * (Classic v1 or Berry v6) into a `ParsedLockfile`.
 *
 * On socket-btm's smol Node binary this routes to
 * `node:smol-manifest`'s native `parseLockfile(content, 'npm',
 * 'yarn')`; on stock Node it runs the line-scanning JS impl below.
 *
 * Both Classic + Berry share the same outer shape (top-level block
 * with `name@spec:` header + indented properties). Berry is detected
 * via the presence of `__metadata:` and additionally honors
 * `linkType: soft` (workspace links are skipped) and
 * `dependenciesMeta:` blocks (which can mark deps optional).
 *
 * The parser is forgiving — unknown lines are ignored, missing
 * versions skip the entry. It never throws.
 */

import { ArrayPrototypePush } from '../../../../primordials/array'
import { MathMin } from '../../../../primordials/math'
import { ObjectFreeze } from '../../../../primordials/object'
import {
  StringPrototypeCharCodeAt,
  StringPrototypeEndsWith,
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeTrim,
} from '../../../../primordials/string'
import { getSmolManifest } from '../../../../smol/manifest'
import { parseYarnDescriptor } from './parse-yarn-descriptor'

import type { PackageRef, ParsedLockfile } from '../../../manifest/types'

export interface YarnEntryState {
  name: string
  version: string | undefined
  resolved: string | undefined
  integrity: string | undefined
  checksum: string | undefined
  dependencies: string[]
  isOptional: boolean
  linkType: string | undefined
}

type PackageIndex = Record<string, number | number[]>

export function addToYarnIndex(
  packageIndex: PackageIndex,
  name: string,
  idx: number,
): void {
  const existing = packageIndex[name]
  if (existing === undefined) {
    packageIndex[name] = idx
  } else if (typeof existing === 'number') {
    packageIndex[name] = [existing, idx]
  } else {
    ArrayPrototypePush(existing, idx)
  }
}

export function consumeDependenciesMeta(
  content: string,
  startPos: number,
  _entry: YarnEntryState,
): number {
  // `dependenciesMeta.<child>.optional = true` flags a CHILD as
  // optional (the parent listed it as an optional peer / optional
  // subdependency), not the parent itself. Flipping the parent's
  // `isOptional` based on any child's flag was inverted semantics —
  // it made every package with `fsevents`-like optional children
  // (very common) show up as optional. Consume the block to advance
  // `pos`, but don't synthesize anything from it. The parent's own
  // optionality comes from how upstream references it, which yarn
  // lockfiles don't encode at the entry level.
  let pos = startPos
  while (pos < content.length) {
    const eol = StringPrototypeIndexOf(content, '\n', pos)
    const end = eol === -1 ? content.length : eol
    const line = StringPrototypeSlice(content, pos, end)
    if (
      line.length < 4 ||
      line[0] !== ' ' ||
      line[1] !== ' ' ||
      line[2] !== ' ' ||
      line[3] !== ' '
    ) {
      break
    }
    pos = end + 1
  }
  return pos
}

export function consumeDependencyList(
  content: string,
  startPos: number,
  deps: string[],
): number {
  let pos = startPos
  while (pos < content.length) {
    const eol = StringPrototypeIndexOf(content, '\n', pos)
    const end = eol === -1 ? content.length : eol
    const line = StringPrototypeSlice(content, pos, end)
    if (
      line.length < 4 ||
      line[0] !== ' ' ||
      line[1] !== ' ' ||
      line[2] !== ' ' ||
      line[3] !== ' '
    ) {
      break
    }
    const depLine = StringPrototypeTrim(line)
    // Berry: `name: spec`. Classic: `name "spec"`. Take everything
    // before the first colon or space, whichever comes first.
    const colonIdx = StringPrototypeIndexOf(depLine, ':')
    const spaceIdx = StringPrototypeIndexOf(depLine, ' ')
    const sepIdx =
      colonIdx === -1
        ? spaceIdx
        : spaceIdx === -1
          ? colonIdx
          : MathMin(colonIdx, spaceIdx)
    if (sepIdx > 0) {
      ArrayPrototypePush(
        deps,
        stripQuotes(StringPrototypeSlice(depLine, 0, sepIdx)),
      )
    }
    pos = end + 1
  }
  return pos
}

export function consumeEntryProperties(
  content: string,
  startPos: number,
  entry: YarnEntryState,
): number {
  let pos = startPos
  while (pos < content.length) {
    const eol = StringPrototypeIndexOf(content, '\n', pos)
    const end = eol === -1 ? content.length : eol
    const line = StringPrototypeSlice(content, pos, end)
    if (line.length === 0 || (line[0] !== ' ' && line[0] !== '\t')) {
      break
    }
    const propLine = StringPrototypeTrim(line)
    pos = end + 1

    if (
      StringPrototypeIndexOf(propLine, 'version ') === 0 ||
      StringPrototypeIndexOf(propLine, 'version:') === 0
    ) {
      entry.version = stripQuotes(valueAfterKey(propLine, 'version '.length))
    } else if (
      StringPrototypeIndexOf(propLine, 'resolved ') === 0 ||
      StringPrototypeIndexOf(propLine, 'resolved:') === 0
    ) {
      entry.resolved = stripQuotes(valueAfterKey(propLine, 'resolved '.length))
    } else if (
      StringPrototypeIndexOf(propLine, 'integrity ') === 0 ||
      StringPrototypeIndexOf(propLine, 'integrity:') === 0
    ) {
      entry.integrity = valueAfterKey(propLine, 'integrity '.length)
    } else if (
      StringPrototypeIndexOf(propLine, 'checksum ') === 0 ||
      StringPrototypeIndexOf(propLine, 'checksum:') === 0
    ) {
      entry.checksum = valueAfterKey(propLine, 'checksum '.length)
    } else if (StringPrototypeIndexOf(propLine, 'linkType') === 0) {
      const colonIdx = StringPrototypeIndexOf(propLine, ':')
      if (colonIdx > 0) {
        entry.linkType = StringPrototypeTrim(
          StringPrototypeSlice(propLine, colonIdx + 1),
        )
      }
    } else if (StringPrototypeIndexOf(propLine, 'resolution') === 0) {
      const colonIdx = StringPrototypeIndexOf(propLine, ':')
      if (colonIdx > 0) {
        const resValue = stripQuotes(
          StringPrototypeTrim(StringPrototypeSlice(propLine, colonIdx + 1)),
        )
        if (
          StringPrototypeIndexOf(resValue, 'http://') === 0 ||
          StringPrototypeIndexOf(resValue, 'https://') === 0
        ) {
          entry.resolved = resValue
        }
      }
    } else if (StringPrototypeIndexOf(propLine, 'dependencies:') === 0) {
      pos = consumeDependencyList(content, pos, entry.dependencies)
    } else if (StringPrototypeIndexOf(propLine, 'dependenciesMeta:') === 0) {
      pos = consumeDependenciesMeta(content, pos, entry)
    }
  }
  return pos
}

export function jsParseYarnLock(content: string): ParsedLockfile {
  const packages: PackageRef[] = []
  const packageIndex: PackageIndex = {
    __proto__: null,
  } as unknown as PackageIndex
  const isBerry = StringPrototypeIndexOf(content, '__metadata:') !== -1

  let pos = 0
  while (pos < content.length) {
    const eol = StringPrototypeIndexOf(content, '\n', pos)
    const end = eol === -1 ? content.length : eol
    const line = StringPrototypeSlice(content, pos, end)
    pos = end + 1

    if (!line || StringPrototypeTrim(line) === '' || line[0] === '#') {
      continue
    }
    if (StringPrototypeTrim(line) === '__metadata:') {
      pos = skipIndentedBlock(content, pos)
      continue
    }
    if (line[0] === ' ' || line[0] === '\t') {
      continue
    }
    const trimmed = StringPrototypeTrim(line)
    if (!StringPrototypeEndsWith(trimmed, ':')) {
      continue
    }
    const spec = StringPrototypeTrim(StringPrototypeSlice(trimmed, 0, -1))
    let header = stripQuotes(spec)
    const commaIdx = StringPrototypeIndexOf(header, ',')
    if (commaIdx !== -1) {
      header = StringPrototypeTrim(StringPrototypeSlice(header, 0, commaIdx))
    }
    if (StringPrototypeIndexOf(header, '@workspace:') !== -1) {
      pos = skipIndentedBlock(content, pos)
      continue
    }
    const parsed = parseYarnDescriptor(header)
    const entry = newEntry(parsed.name)
    pos = consumeEntryProperties(content, pos, entry)

    if (isBerry && entry.linkType === 'soft') {
      continue
    }
    if (entry.name && entry.version) {
      const ref = ObjectFreeze({
        __proto__: null,
        name: entry.name,
        version: entry.version,
        resolved: entry.resolved,
        integrity: entry.integrity || entry.checksum || undefined,
        ecosystem: 'npm',
        depType: 'prod',
        isDev: false,
        isOptional: entry.isOptional,
        isPeer: false,
        isBundled: false,
        vcsUrl: undefined,
        vcsCommit: undefined,
        dependencies: entry.dependencies,
      }) as unknown as PackageRef
      ArrayPrototypePush(packages, ref)
      addToYarnIndex(packageIndex, entry.name, packages.length - 1)
    }
  }

  return ObjectFreeze({
    __proto__: null,
    type: 'lockfile',
    lockVersion: isBerry ? 'berry' : '1',
    ecosystem: 'npm',
    packages: ObjectFreeze(packages),
    _index: packageIndex,
  }) as unknown as ParsedLockfile
}

export function newEntry(name: string): YarnEntryState {
  return {
    name,
    version: undefined,
    resolved: undefined,
    integrity: undefined,
    checksum: undefined,
    dependencies: [],
    isOptional: false,
    linkType: undefined,
  }
}

export function skipIndentedBlock(content: string, startPos: number): number {
  let pos = startPos
  while (pos < content.length) {
    const eol = StringPrototypeIndexOf(content, '\n', pos)
    const end = eol === -1 ? content.length : eol
    const line = StringPrototypeSlice(content, pos, end)
    if (line.length === 0 || (line[0] !== ' ' && line[0] !== '\t')) {
      return pos
    }
    pos = end + 1
  }
  return pos
}

export function stripQuotes(s: string): string {
  if (s.length === 0) {
    return s
  }
  let out = s
  if (StringPrototypeCharCodeAt(out, 0) === 34 /* " */) {
    out = StringPrototypeSlice(out, 1)
  }
  if (out.length > 0 && StringPrototypeCharCodeAt(out, out.length - 1) === 34) {
    out = StringPrototypeSlice(out, 0, -1)
  }
  return out
}

export function valueAfterKey(line: string, keyLen: number): string {
  // Both `key "value"` (Classic) and `key: value` (Berry) share the
  // same total prefix length when `keyLen` is passed as the byte
  // length of `'key '` (Classic, space-terminated). Berry's `key:`
  // has the same character count when `keyLen` includes the colon's
  // trailing space — every callsite passes `'key '.length`, which
  // covers `key:` plus the value's leading space. Slicing after that
  // prefix yields the raw value regardless of dialect.
  return StringPrototypeTrim(StringPrototypeSlice(line, keyLen))
}

const _smol = getSmolManifest()

export const parseYarnLock: (content: string) => ParsedLockfile = _smol
  ? /* c8 ignore next 2 - smol Node binary only. */
    (content: string) =>
      _smol.parseLockfile(content, 'npm', 'yarn') as ParsedLockfile
  : jsParseYarnLock
