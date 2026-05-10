/**
 * @fileoverview Error-message enrichment for HTTP/HTTPS requests.
 *
 * `enrichErrorMessage` translates Node.js network error codes
 * (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, etc.) into user-facing
 * guidance prefixed with the failing method + URL. The wording is
 * generic — no product-specific branding — so the request leaves can
 * use it for any caller. `request.ts` invokes this on the `request`
 * `'error'` event before rejecting, which is what surfaces the
 * actionable messages to consumers.
 */

/**
 * Build an enriched error message based on the error code.
 * Generic guidance (no product-specific branding).
 *
 * @example
 * ```typescript
 * try {
 *   await fetch('https://api.example.com')
 * } catch (e) {
 *   console.error(enrichErrorMessage('https://api.example.com', 'GET', e))
 * }
 * ```
 */
export function enrichErrorMessage(
  url: string,
  method: string,
  error: NodeJS.ErrnoException,
): string {
  const code = error.code
  let message = `${method} request failed: ${url}`
  if (code === 'ECONNREFUSED') {
    message +=
      '\n→ Connection refused. Server is unreachable.\n→ Check: Network connectivity and firewall settings.'
  } else if (code === 'ENOTFOUND') {
    message +=
      '\n→ DNS lookup failed. Cannot resolve hostname.\n→ Check: Internet connection and DNS settings.'
  } else if (code === 'ETIMEDOUT') {
    message +=
      '\n→ Connection timed out. Network or server issue.\n→ Try: Check network connectivity and retry.'
  } else if (code === 'ECONNRESET') {
    message +=
      '\n→ Connection reset by server. Possible network interruption.\n→ Try: Retry the request.'
  } else if (code === 'EPIPE') {
    message +=
      '\n→ Broken pipe. Server closed connection unexpectedly.\n→ Check: Authentication credentials and permissions.'
  } else if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  ) {
    message +=
      '\n→ SSL/TLS certificate error.\n→ Check: System time and date are correct.\n→ Try: Update CA certificates on your system.'
  } else if (code) {
    message += `\n→ Error code: ${code}`
  }
  return message
}
