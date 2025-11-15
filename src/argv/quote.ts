/**
 * Argument quoting utilities for shell execution with spawn()
 *
 * These functions handle quoting of command-line arguments when using
 * child_process.spawn() with shell: true.
 *
 * IMPORTANT: Only needed when shell: true. With shell: false, arguments
 * are passed directly to the OS kernel as an array (no quoting needed).
 */

/**
 * Quote an argument for POSIX shell execution (bash, sh, zsh).
 *
 * Uses single quotes (POSIX standard) which prevent all expansions except
 * single quotes themselves. Internal single quotes are escaped using '\''
 *
 * @param arg - Argument to quote
 * @returns Quoted argument safe for POSIX shells when using shell: true
 *
 * @example
 * ```ts
 * import { posixQuote } from '@socketsecurity/lib/argv/quote'
 *
 * // With shell: true on Unix
 * const path = '/path/with spaces/file.txt'
 * spawn('sh', ['-c', 'cat', posixQuote(path)], { shell: true })
 * // sh receives: sh -c cat '/path/with spaces/file.txt'
 * ```
 */
export function posixQuote(arg: string): string {
  // If no special characters, return as-is
  if (!/[\s&|<>$`\\*?[\](){};"'~!#]/.test(arg)) {
    return arg
  }
  // Use single quotes and escape internal single quotes as '\''
  // In POSIX shells, you can't escape inside single quotes, so to include a literal single quote:
  // 1. End the current single-quoted string (')
  // 2. Add an escaped single quote outside quotes (\')
  // 3. Start a new single-quoted string (')
  // Example: "it's" becomes 'it'\''s' which the shell parses as: 'it' + \' + 's'
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Quote an argument for Windows cmd.exe shell execution.
 *
 * Uses double quotes (cmd.exe standard) and escapes internal quotes by doubling.
 * Handles all cmd.exe special characters: space, &, |, <, >, ^, %, (, ), !, "
 *
 * @param arg - Argument to quote
 * @returns Quoted argument safe for cmd.exe when using shell: true
 *
 * @example
 * ```ts
 * import { win32Quote } from '@socketsecurity/lib/argv/quote'
 *
 * // With shell: true on Windows
 * const path = 'C:\\Program Files\\app.exe'
 * spawn('cmd', ['/c', 'app', win32Quote(path)], { shell: true })
 * // cmd.exe receives: cmd /c app "C:\Program Files\app.exe"
 * ```
 */
export function win32Quote(arg: string): string {
  // If no special characters that need quoting, return as-is
  if (!/[\s&|<>^%()!"]/.test(arg)) {
    return arg
  }
  // Wrap in double quotes and escape internal quotes by doubling them
  // This is the standard Windows cmd.exe quoting method
  return `"${arg.replace(/"/g, '""')}"`
}
