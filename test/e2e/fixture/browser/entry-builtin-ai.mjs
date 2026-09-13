// Browser contract for the cross-runtime built-in AI resolver. The bundled
// public leaf must return the browser's exact factory without touching Node.
import { getLanguageModel } from '@socketsecurity/lib/ai/builtin'

export function getFactory() {
  return getLanguageModel()
}
