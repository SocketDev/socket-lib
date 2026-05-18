/**
 * @file Public type surface for `tables/*` modules — the `ColumnAlignment`
 *   union + `TableColumn` config record. Pure types, no runtime side effects.
 */

export type ColumnAlignment = 'left' | 'right' | 'center'

/**
 * Table column configuration.
 */
export type TableColumn = {
  key: string
  header: string
  align?: ColumnAlignment | undefined
  width?: number | undefined
  color?: ((value: string) => string) | undefined
}
