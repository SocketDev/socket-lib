// Browser-load contract for the debug + memo + cache/ttl/browser family. With
// node builtins stubbed (the lib's package.json `browser` field), importing
// these leaves must EVALUATE cleanly in a context with no `process` global;
// `debugLog` must no-op without throwing (SOCKET_DEBUG unreadable ⇒ disabled);
// `memoizeAsync` must memoize; and `createBrowserTtlCache` must round-trip.
// The e2e test bundles this entry with webpack and executes the bundle inside
// a bare `node:vm` context to prove all four.
import { createBrowserTtlCache } from '@socketsecurity/lib/cache/ttl/browser'
import { debugLog } from '@socketsecurity/lib/debug/output'
import { memoizeAsync } from '@socketsecurity/lib/memo/async'

export async function run() {
  let debugLogThrew = false
  try {
    debugLog('browser no-op probe')
  } catch {
    debugLogThrew = true
  }
  let calls = 0
  const double = memoizeAsync(async n => {
    calls += 1
    return n * 2
  })
  const a = await double(21)
  const b = await double(21)
  const cache = createBrowserTtlCache({ prefix: 'e2e', ttl: 60_000 })
  await cache.set('k', 7)
  const cached = await cache.get('k')
  return { a, b, cached, calls, debugLogThrew }
}
