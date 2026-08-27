/**
 * @file Types for the editable-YAML surface. The parser is INJECTED rather
 *   than imported: socket-lib ships zero runtime dependencies, and pulling in
 *   `yaml` to edit a config would make it the first one. Callers pass the
 *   `yaml` module they already have, so the contract here is the small slice
 *   of its Document API this surface uses, not the package itself.
 */

/**
 * The slice of `yaml`'s Document this editor drives.
 *
 * Deliberately narrow. A caller may pass `yaml` itself, a version-pinned copy,
 * or a stub in a test, and only these members have to hold. `yaml`'s own
 * methods take extra optional arguments, which stays assignable to these.
 */
export interface YamlDocumentLike {
  /**
   * Delete a top-level key. Returns false when the key was absent.
   *
   * The whole value goes with the key, which is the entire reason this surface
   * exists: a line-based edit removes `key:` and orphans the block sequence
   * indented beneath it, producing YAML that no longer parses.
   */
  delete(key: string): boolean
  get(key: string): unknown
  has(key: string): boolean
  set(key: string, value: unknown): void
  /**
   * Re-serialize. The Document is a CST, so untouched lines, comments and
   * blank-line spacing come back byte-identical.
   */
  toString(): string
}

/**
 * The injected parser: anything exposing `yaml`'s `parseDocument`.
 */
export interface YamlParserLike {
  parseDocument(source: string): YamlDocumentLike
}

export interface EditableYamlOptions {
  /**
   * The parser to drive. Required, because this module imports none.
   */
  parser: YamlParserLike
}

export interface EditableYamlSaveOptions {
  /**
   * Write even when the serialized text is byte-identical to what was read.
   *
   * Off by default so an unchanged file keeps its mtime, which the cascade's
   * staleness checks read.
   */
  force?: boolean | undefined
}

export interface EditableYamlInstance {
  /**
   * The parsed Document, for reads these convenience methods do not cover.
   */
  readonly document: YamlDocumentLike
  /**
   * The path loaded from, or undefined when built from a string.
   */
  readonly path: string | undefined
  delete(key: string): boolean
  get(key: string): unknown
  has(key: string): boolean
  save(options?: EditableYamlSaveOptions | undefined): Promise<boolean>
  set(key: string, value: unknown): this
  /**
   * The current serialized text, without writing it.
   */
  toString(): string
}
