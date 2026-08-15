/**
 * @file Types for the vendored `@npmcli/package-json` read-package helpers.
 *   Written rather than suppressed. The call site carried a
 *   `@ts-expect-error`, which only covers the NEXT line — so once the import
 *   wrapped across lines (any formatter pass will wrap it, the specifier is
 *   long), the directive landed on `import {` while the unresolved specifier
 *   sat two lines below. The directive then reported as unused AND the
 *   implicit-any error escaped, failing the type gate on a file nobody had
 *   touched.
 *   A declaration removes the race: there is nothing left to suppress, so no
 *   directive can drift off its target.
 */

/**
 * Parse a package.json's raw contents into a plain object.
 */
export declare function parse(raw: string): Record<string, unknown>

/**
 * Read a package.json file and answer its RAW contents.
 *
 * Typed from the call site rather than guessed: the result is assigned to
 * `readFileContent` (a string) and then handed to `parse`, so this reads the
 * file and does not parse it, whatever its name suggests.
 */
export declare function read(file: string): Promise<string>
