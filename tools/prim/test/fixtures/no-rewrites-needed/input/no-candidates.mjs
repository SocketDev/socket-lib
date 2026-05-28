// File with no primordial-replaceable calls. The codemod should make zero
// rewrites and the validator should report success.
export const greeting = 'hello world'

export function add(a, b) {
  return a + b
}
