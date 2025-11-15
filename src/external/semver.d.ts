export interface SemVerParsed {
  version: string
  major: number
  minor: number
  patch: number
  prerelease: ReadonlyArray<string | number>
  build: readonly string[]
}

export function coerce(version: string | number): { version: string } | null
export function compare(v1: string, v2: string): -1 | 0 | 1
export function satisfies(version: string, range: string): boolean
export function parse(version: string): SemVerParsed | null
export function inc(
  version: string,
  release: string,
  identifier?: string,
): string | null
export function eq(version1: string, version2: string): boolean
export function gt(version1: string, version2: string): boolean
export function gte(version1: string, version2: string): boolean
export function lt(version1: string, version2: string): boolean
export function lte(version1: string, version2: string): boolean
export function valid(version: string): string | null
export function maxSatisfying(versions: string[], range: string): string | null
export function minSatisfying(versions: string[], range: string): string | null
export function sort(versions: string[]): string[]
export function rsort(versions: string[]): string[]
export function diff(
  version1: string,
  version2: string,
):
  | 'major'
  | 'premajor'
  | 'minor'
  | 'preminor'
  | 'patch'
  | 'prepatch'
  | 'prerelease'
  | 'release'
  | null
