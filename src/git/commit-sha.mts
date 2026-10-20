/**
 * True when value is a full 40-character lowercase SHA-1 commit ID.
 */
export function isFullCommitSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}
