/**
 * @file Surface-preserving YAML editor, the sibling of `json/edit`.
 *   WHY THIS EXISTS. A YAML config is normally edited by regex or by filtering
 *   lines. Both break the document as soon as a key owns an indented block.
 *   Dropping the line `catalogShadowIgnore:` leaves its `- 'nock'` entries
 *   behind at the same indent, and the next parse fails with "did not find
 *   expected key". That happened across three fleet repos in one sweep.
 *   `yaml`'s Document is a CST: it round-trips comments, key order and
 *   blank-line spacing, and removing a key takes its whole value node with it.
 *   This wraps that with the load / mutate / save shape `json/edit` already
 *   established, so the two read the same at a call site.
 *   THE PARSER IS INJECTED. socket-lib ships zero runtime dependencies;
 *   importing `yaml` here would make it the first. Callers pass the module they
 *   already have:
 *   import * as yaml from 'yaml'
 *   const doc = await EditableYaml.load(path, { parser: yaml })
 *   doc.delete('catalogShadowIgnore')
 *   await doc.save()
 */

import { readFile, retryWrite } from '../json/edit.mjs'

import type {
  EditableYamlInstance,
  EditableYamlOptions,
  EditableYamlSaveOptions,
  YamlDocumentLike,
  YamlParserLike,
} from './types.mjs'

/**
 * A loaded YAML file, edited through its Document and written back intact.
 */
export class EditableYaml implements EditableYamlInstance {
  #document: YamlDocumentLike
  #readText: string
  #path: string | undefined

  private constructor(
    document: YamlDocumentLike,
    readText: string,
    path: string | undefined,
  ) {
    this.#document = document
    this.#readText = readText
    this.#path = path
  }

  get document(): YamlDocumentLike {
    return this.#document
  }

  get path(): string | undefined {
    return this.#path
  }

  /**
   * Parse YAML text with no file behind it. `save` rejects on the result,
   * because there is nowhere to write.
   */
  static fromString(
    source: string,
    options: EditableYamlOptions,
  ): EditableYaml {
    const opts = { __proto__: null, ...options } as EditableYamlOptions
    return new EditableYaml(
      opts.parser.parseDocument(source),
      source,
      undefined,
    )
  }

  /**
   * Read and parse a YAML file.
   */
  static async load(
    path: string,
    options: EditableYamlOptions,
  ): Promise<EditableYaml> {
    const opts = { __proto__: null, ...options } as EditableYamlOptions
    const text = await readFile(path)
    return new EditableYaml(opts.parser.parseDocument(text), text, path)
  }

  /**
   * Remove a top-level key and everything nested under it. False when absent.
   */
  delete(key: string): boolean {
    return this.#document.delete(key)
  }

  get(key: string): unknown {
    return this.#document.get(key)
  }

  has(key: string): boolean {
    return this.#document.has(key)
  }

  /**
   * Write the file back. Returns false when nothing changed.
   *
   * The no-change case is a skip rather than a write so an unchanged file keeps
   * its mtime, which the cascade's staleness checks read.
   */
  async save(options?: EditableYamlSaveOptions | undefined): Promise<boolean> {
    const opts = { __proto__: null, ...options } as EditableYamlSaveOptions
    const path = this.#path
    if (!path) {
      throw new Error('EditableYaml: no file path to save to')
    }
    const text = this.toString()
    if (!opts.force && text === this.#readText) {
      return false
    }
    await retryWrite(path, text)
    this.#readText = text
    return true
  }

  set(key: string, value: unknown): this {
    this.#document.set(key, value)
    return this
  }

  toString(): string {
    return this.#document.toString()
  }
}

export type {
  EditableYamlInstance,
  EditableYamlOptions,
  EditableYamlSaveOptions,
  YamlDocumentLike,
  YamlParserLike,
}
