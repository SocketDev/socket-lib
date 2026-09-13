import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import { getBindingIdentifiers } from '@babel/types'
import { repositoryContainsTarget } from '../../../.git-hooks/_shared/repo-containment.mts'

export interface PlannedApiReference {
  api: string
  targetVersion: string
  pathHint?: string | undefined
}

function invalidPlannedReference(detail: string): never {
  throw new Error(
    `Planned API evidence is invalid. Where: consumer usage aggregate. Saw ${detail}; wanted an unambiguous public API name. Fix: correct the API name or provide its current public path hint.`,
  )
}

function validatePlannedReference(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    invalidPlannedReference('a non-object reference')
  }
  const reference = item as Record<string, unknown>
  const keys = Object.keys(reference)
  if (
    keys.some(key => !['api', 'targetVersion', 'pathHint'].includes(key)) ||
    typeof reference['api'] !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9]*$/.test(reference['api']) ||
    typeof reference['targetVersion'] !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(reference['targetVersion']) ||
    (keys.includes('pathHint') &&
      (typeof reference['pathHint'] !== 'string' ||
        !/^[a-z0-9][a-z0-9./-]*$/.test(reference['pathHint'])))
  ) {
    invalidPlannedReference('invalid reference fields')
  }
  return reference
}

export function validatePlannedApiReferences(
  value: unknown,
): asserts value is PlannedApiReference[] {
  if (!Array.isArray(value)) {
    invalidPlannedReference('a non-array reference list')
  }
  let previous: string | undefined
  for (const item of value) {
    const reference = validatePlannedReference(item)
    const key = `${reference['api']}\0${reference['targetVersion']}\0${reference['pathHint'] ?? ''}`
    if (previous !== undefined && key <= previous) {
      invalidPlannedReference('unsorted or duplicate references')
    }
    previous = key
  }
}

export function consumerSourceTargets(
  repoRoot: string,
  value: unknown,
): string[] {
  if (typeof value === 'string') {
    if (!value.startsWith('./dist/')) {
      return []
    }
    const stem = value.slice(7).replace(/(?:\.d)?\.[cm]?[jt]s$/, '')
    for (const extension of ['.mts', '.ts', '.cts']) {
      const file = path.join(repoRoot, 'src', `${stem}${extension}`)
      if (existsSync(file)) {
        if (!repositoryContainsTarget(repoRoot, file)) {
          invalidPlannedReference('an external source target')
        }
        return [file]
      }
    }
    return []
  }
  if (!value || typeof value !== 'object') {
    return []
  }
  return [
    ...new Set(
      Object.values(value).flatMap(target =>
        consumerSourceTargets(repoRoot, target),
      ),
    ),
  ]
}

function sourceExportNames(
  repoRoot: string,
  file: string,
  visiting: Set<string>,
): Set<string> {
  if (visiting.has(file) || !repositoryContainsTarget(repoRoot, file)) {
    invalidPlannedReference('a cyclic or external export-star target')
  }
  visiting.add(file)
  const names = new Set<string>()
  const ast = parse(readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript'],
  })
  for (const statement of ast.program.body) {
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) {
        const bindings = Object.keys(
          getBindingIdentifiers(statement.declaration, false, true),
        )
        for (let i = 0, { length } = bindings; i < length; i += 1) {
          names.add(bindings[i]!)
        }
      }
      for (const specifier of statement.specifiers) {
        names.add(
          specifier.exported.type === 'Identifier'
            ? specifier.exported.name
            : specifier.exported.value,
        )
      }
    } else if (statement.type === 'ExportDefaultDeclaration') {
      names.add('default')
    } else if (statement.type === 'ExportAllDeclaration') {
      const specifier = statement.source.value
      if (!specifier.startsWith('.')) {
        invalidPlannedReference('an unresolved external export-star target')
      }
      const base = path.resolve(
        path.dirname(file),
        specifier.replace(/\.[cm]?[jt]s$/, ''),
      )
      const target = ['.mts', '.ts', '.cts', '/index.mts', '/index.ts']
        .map(extension => `${base}${extension}`)
        .find(candidate => existsSync(candidate))
      if (!target) {
        invalidPlannedReference('an unresolved export-star target')
      }
      for (const name of sourceExportNames(repoRoot, target, visiting)) {
        if (name !== 'default') {
          names.add(name)
        }
      }
    }
  }
  visiting.delete(file)
  return names
}

export function plannedConsumerLeaves(
  repoRoot: string,
  references: readonly PlannedApiReference[],
): string[] {
  validatePlannedApiReferences(references)
  if (references.length === 0) {
    return []
  }
  const manifestPath = path.join(repoRoot, 'package.json')
  if (!repositoryContainsTarget(repoRoot, manifestPath)) {
    invalidPlannedReference('external package metadata')
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    exports?: Record<string, unknown> | undefined
  }
  const entries = Object.entries(manifest.exports ?? {})
    .filter(([key]) => key.startsWith('./') && !key.includes('*'))
    .map(([key, value]) => ({
      __proto__: null,
      leaf: key.slice(2),
      files: consumerSourceTargets(repoRoot, value),
    }))
  const names = new Map<string, Set<string>>()
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]!
    for (const file of entry.files) {
      for (const name of sourceExportNames(repoRoot, file, new Set())) {
        const leaves = names.get(name) ?? new Set<string>()
        leaves.add(entry.leaf)
        names.set(name, leaves)
      }
    }
  }
  const used = new Set<string>()
  for (const reference of references) {
    const candidates = [...(names.get(reference.api) ?? [])]
    const leaf =
      candidates.length === 1
        ? candidates[0]
        : candidates.find(candidate => candidate === reference.pathHint)
    if (!leaf) {
      invalidPlannedReference(
        `${candidates.length === 0 ? 'missing' : 'ambiguous'} API ${reference.api}`,
      )
    }
    used.add(leaf)
  }
  return [...used].toSorted()
}
