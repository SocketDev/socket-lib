import { startBrowserTask } from '../../browser/bridge.mts'

import type { BrowserTask } from '../../browser/bridge.mts'

function nativeNpmGrantUrl(candidate: string): URL | undefined {
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return undefined
  }
  if (
    url.href !== candidate ||
    url.protocol !== 'https:' ||
    !['npmjs.com', 'www.npmjs.com'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    return undefined
  }
  const cliGrant = /^\/auth\/cli\/[a-z0-9._-]+$/iu.test(url.pathname)
  const loginGrant =
    url.pathname === '/login' &&
    url.searchParams.size === 1 &&
    /^\/login\/cli\/[a-z0-9._-]+$/iu.test(url.searchParams.get('next') ?? '')
  if ((!cliGrant || url.search) && !loginGrant) {
    return undefined
  }
  url.hostname = 'www.npmjs.com'
  return url
}

export async function openNativeNpmGrantUrl(url: string): Promise<BrowserTask> {
  const target = nativeNpmGrantUrl(url)
  if (!target) {
    throw new Error(
      'Cannot open npm approval. Where: npm grant URL. Saw: an untrusted URL; wanted an exact HTTPS npmjs.com CLI grant. Fix: restart the npm command.',
    )
  }
  return startBrowserTask({
    targetUrl: target.href,
    taskName: 'npm-approval',
  })
}

export function redactNativeNpmGrantOutput(text: string): string {
  return text.replace(
    // Redact npm auth/login grants and the registry completion authId.
    /https?:\/\/(?:[a-z0-9.-]*npmjs\.com\/(?:auth|login)(?:\/cli\/[^\s?#]+)?[^\s]*|registry\.npmjs\.org\/-\/v1\/done\?authId=[^\s]+)/giu,
    '[redacted npm authentication grant]',
  )
}
