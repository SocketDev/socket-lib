/**
 * @fileoverview Environment variable type conversion helpers.
 */

/*@__NO_SIDE_EFFECTS__*/
export function envAsBoolean(value: string | undefined): boolean {
  if (!value) {
    return false
  }
  const lower = value.toLowerCase()
  return lower === 'true' || lower === '1' || lower === 'yes'
}

/*@__NO_SIDE_EFFECTS__*/
export function envAsNumber(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const num = Number(value)
  return Number.isNaN(num) ? 0 : num
}

/*@__NO_SIDE_EFFECTS__*/
export function envAsString(value: string | undefined): string {
  return value || ''
}
