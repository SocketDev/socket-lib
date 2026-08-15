/**
 * @file Public type surface for `compression/*` modules — the `CompressOptions`
 *   accepted by every compression entrypoint and `CompressFileOptions` which
 *   extends it with `inPlace`. Pure types, no runtime side effects.
 */

export interface CompressOptions {
  /**
   * Compression level. Brotli accepts 0–11 (11 = max, slowest). Gzip accepts
   * 0–9 (9 = max). Defaults: brotli 11, gzip 6.
   */
  level?: number | undefined
  /**
   * Hint for the input size in bytes. Lets brotli pick a better window/blocking
   * strategy. Pass when known; ignored for gzip.
   */
  size?: number | undefined
}

/**
 * Options for the file-to-file helpers. Pass `{ inPlace: true }` to skip the
 * explicit destPath argument: the helper picks the canonical destination (`.br`
 * / `.gz` suffix on compress; suffix stripped on decompress) and removes the
 * source file on success.
 *
 * Await compressBrotliFile('input.json', { inPlace: true }) // => writes
 * input.json.br, deletes input.json.
 *
 * Await decompressBrotliFile('input.json.br', { inPlace: true }) // => writes
 * input.json, deletes input.json.br.
 */
export interface CompressFileOptions extends CompressOptions {
  /**
   * Replace the source file: derive destPath from srcPath, then
   * `safeDelete(srcPath)` after the write succeeds. When set, the `destPath`
   * positional argument must be omitted.
   */
  inPlace?: boolean | undefined
}
