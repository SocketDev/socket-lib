export const BROWSER_HELP_BOUNDS = { height: 520, width: 600 }

export function browserHelpResult(
  helpId: string,
  outcome: unknown,
  window: { height?: number | undefined; width?: number | undefined },
) {
  return {
    __proto__: null,
    helpId,
    outcome,
    windowBounds: { height: window.height, width: window.width },
  }
}

export function assertBrowserHelpWindowBounds(value: unknown): void {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('height' in value) ||
    !('width' in value) ||
    value.height !== BROWSER_HELP_BOUNDS.height ||
    value.width !== BROWSER_HELP_BOUNDS.width
  ) {
    throw new Error(
      'Approval window verification failed. Where: browser bridge help. Saw: missing or unexpected measured bounds; wanted 600 by 520. Fix: reload the current extension and rerun browser:verify-installed.',
    )
  }
}
