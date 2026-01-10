/**
 * @fileoverview Build validation tests for external dependency bundling.
 *
 * Tests build integrity for vendored external dependencies:
 * - Validates dist/external/ contains real bundled code (not stubs)
 * - Ensures external packages are only imported from dist/external/
 * - Prevents accidental stub re-exports in distribution
 * - Verifies devDependencies aren't leaked into production build
 * Critical for ensuring proper dependency bundling and tree-shaking.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = process.cwd()
const distDir = path.join(rootDir, 'dist')
const distExternalDir = path.join(rootDir, 'dist', 'external')

/**
 * Read devDependencies from package.json
 */
async function getDevDependencies(): Promise<string[]> {
  const packageJsonPath = path.join(rootDir, 'package.json')
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonContent)
  return Object.keys(packageJson.devDependencies || {})
}

// Stub re-export patterns that indicate incomplete bundling
const STUB_PATTERNS = [
  /^\s*module\.exports\s*=\s*require\s*\(/,
  /^\s*export\s+\{\s*\}\s*from\s+/,
  /^\s*export\s+\*\s+from\s+/,
]

/**
 * Check if a file content is a stub re-export
 */
function isStubReexport(content: string): boolean {
  return STUB_PATTERNS.some(pattern => pattern.test(content.trim()))
}

/**
 * Get all .js files in a directory recursively
 */
async function getAllJsFiles(dir: string): Promise<string[]> {
  async function walk(currentDir: string): Promise<string[]> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    const filePromises: Array<Promise<string[]>> = []

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        filePromises.push(walk(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        filePromises.push(Promise.resolve([fullPath]))
      }
    }

    const results = await Promise.all(filePromises)
    return results.flat()
  }

  return await walk(dir)
}

describe('build-externals', () => {
  it('should have empty dependencies in package.json', async () => {
    const devDependencies = await getDevDependencies()
    const packageJsonPath = path.join(rootDir, 'package.json')
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(packageJsonContent)

    // Dependencies must be undefined or an empty object
    const dependencies = packageJson.dependencies

    // Check that dependencies is either undefined or an empty object
    const isUndefined = dependencies === undefined
    const isEmptyObject =
      dependencies !== null &&
      typeof dependencies === 'object' &&
      Object.keys(dependencies).length === 0

    if (!isUndefined && !isEmptyObject) {
      const dependencyList = dependencies
        ? Object.keys(dependencies).join(', ')
        : 'invalid value'
      expect.fail(
        [
          'package.json dependencies must be undefined or an empty object.',
          `Found dependencies: ${dependencyList}`,
          '',
          'All dependencies should be either:',
          '  - Bundled in dist/external (add to devDependencies)',
          '  - Peer dependencies (add to peerDependencies)',
          '',
          'This prevents unnecessary package installations for library consumers.',
        ].join('\n'),
      )
    }

    // Ensure we have devDependencies to validate the test is working
    expect(devDependencies.length).toBeGreaterThan(0)
  })

  it('should have bundled dist/external directory', async () => {
    try {
      await fs.access(distExternalDir)
    } catch {
      expect.fail(
        `dist/external directory does not exist at ${distExternalDir}`,
      )
    }
  })

  it('should not have stub re-exports in bundled files', async () => {
    const jsFiles = await getAllJsFiles(distExternalDir)

    // Should have external files
    expect(jsFiles.length).toBeGreaterThan(0)

    // Intentional stubs that are copied from src/external as-is (not bundled)
    // These are too complex or optional to bundle
    const intentionalStubs = [
      '@npmcli/package-json/index.js',
      '@npmcli/package-json/lib/read-package.js',
      '@npmcli/package-json/lib/sort.js',
    ]

    const checkPromises = jsFiles.map(async file => {
      const [content, stat] = await Promise.all([
        fs.readFile(file, 'utf8'),
        fs.stat(file),
      ])
      const relativePath = path.relative(distExternalDir, file)
      // Normalize path separators to forward slashes for cross-platform comparison
      const normalizedPath = relativePath.replace(/\\/g, '/')
      const issues: Array<{ file: string; reason: string }> = []

      // Skip intentional stub files
      if (intentionalStubs.some(stub => normalizedPath.endsWith(stub))) {
        return issues
      }

      // Check for stub re-export patterns
      if (isStubReexport(content)) {
        issues.push({
          file: normalizedPath,
          reason: 'Contains stub re-export pattern',
        })
      }

      // Check for very small files that are likely stubs (< 100 bytes of actual code)
      // Exclude files that are intentionally small (like 1-2KB minified)
      if (stat.size < 50 && isStubReexport(content)) {
        issues.push({
          file: normalizedPath,
          reason: `Very small file (${stat.size} bytes) that appears to be a stub`,
        })
      }

      return issues
    })

    const allIssues = (await Promise.all(checkPromises)).flat()

    if (allIssues.length > 0) {
      const errorMessage = [
        'Found unexpected stub re-exports in dist/external:',
        ...allIssues.map(f => `  - ${f.file}: ${f.reason}`),
        '',
        'Make sure these packages are added to the bundling configuration in scripts/build-externals.mjs',
        'or add them to the intentionalStubs list if they should remain as stubs.',
      ].join('\n')

      expect.fail(errorMessage)
    }
  })

  it('should have @inquirer modules properly bundled', async () => {
    const requiredInquirerModules = [
      'checkbox',
      'confirm',
      'input',
      'password',
      'search',
      'select',
    ]
    const inquirerDir = path.join(distExternalDir, '@inquirer')
    const externalPackPath = path.join(distExternalDir, 'external-pack.js')

    try {
      await fs.access(inquirerDir)
    } catch {
      expect.fail(`@inquirer directory not found at ${inquirerDir}`)
    }

    // Check that external-pack bundle exists and is properly sized.
    // @inquirer packages are now bundled together with shared deps in external-pack.
    try {
      const [packStat, packContent] = await Promise.all([
        fs.stat(externalPackPath),
        fs.readFile(externalPackPath, 'utf8'),
      ])

      if (packStat.size <= 50_000) {
        expect.fail(
          `external-pack should be properly bundled (> 50KB), got ${packStat.size} bytes`,
        )
      }

      if (isStubReexport(packContent)) {
        expect.fail('external-pack should not be a stub re-export')
      }
    } catch (error) {
      expect.fail(
        `external-pack not found or not properly bundled at ${externalPackPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    // Check that individual @inquirer modules are thin wrappers.
    const checkPromises = requiredInquirerModules.map(async module => {
      const modulePath = path.join(inquirerDir, `${module}.js`)

      try {
        const [stat, content] = await Promise.all([
          fs.stat(modulePath),
          fs.readFile(modulePath, 'utf8'),
        ])

        if (stat.size > 1000) {
          expect.fail(
            `@inquirer/${module} should be a thin wrapper (< 1KB), got ${stat.size} bytes`,
          )
        }

        if (!content.includes('external-pack')) {
          expect.fail(
            `@inquirer/${module} should re-export from external-pack bundle`,
          )
        }
      } catch (error) {
        expect.fail(
          `@inquirer/${module} not found or not properly wrapped at ${modulePath}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })

    await Promise.all(checkPromises)
  })

  it('should have @npmcli/arborist properly bundled', async () => {
    const arboristPath = path.join(distExternalDir, '@npmcli', 'arborist.js')
    const npmPackPath = path.join(distExternalDir, 'npm-pack.js')

    try {
      const [arboristStat, arboristContent, npmPackStat] = await Promise.all([
        fs.stat(arboristPath),
        fs.readFile(arboristPath, 'utf8'),
        fs.stat(npmPackPath),
      ])

      // Arborist should be a thin wrapper re-exporting from npm-pack
      if (arboristStat.size > 500) {
        expect.fail(
          `@npmcli/arborist should be a thin wrapper (< 500B), got ${arboristStat.size} bytes`,
        )
      }

      // Should re-export from npm-pack bundle
      if (!arboristContent.includes("require('../npm-pack')")) {
        expect.fail('@npmcli/arborist should re-export from npm-pack bundle')
      }

      // npm-pack bundle should contain arborist
      if (npmPackStat.size <= 1_000_000) {
        expect.fail(
          `npm-pack.js should be a large bundle (> 1MB), got ${npmPackStat.size} bytes`,
        )
      }
    } catch (error) {
      expect.fail(
        `@npmcli/arborist not found or not properly configured at ${arboristPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })

  it('should not bundle node-gyp in npm-pack', async () => {
    const npmPackPath = path.join(distExternalDir, 'npm-pack.js')

    try {
      const content = await fs.readFile(npmPackPath, 'utf8')

      // node-gyp should NOT be bundled - check for its code
      // We look for specific node-gyp implementation details that would only
      // be present if it was bundled (not just string references)
      const nodeGypMarkers = [
        'Find-VisualStudio.cs',
        'node-gyp rebuild',
        'MSBUILD_PATH',
      ]

      const foundMarkers = nodeGypMarkers.filter(marker =>
        content.includes(marker),
      )

      if (foundMarkers.length > 1) {
        expect.fail(
          [
            'node-gyp appears to be bundled in npm-pack.js',
            `Found markers: ${foundMarkers.join(', ')}`,
            '',
            'node-gyp should be external and handled by patches.',
            'Check:',
            '  - pnpm.patchedDependencies in package.json',
            '  - patches/node-gyp@*.patch exists',
            '  - patches/@npmcli__run-script@*.patch exists',
          ].join('\n'),
        )
      }
    } catch (error) {
      expect.fail(
        `npm-pack.js not found at ${npmPackPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })

  it('should not import external packages outside dist/external', async () => {
    const [allDistFiles, devDependencies] = await Promise.all([
      getAllJsFiles(distDir),
      getDevDependencies(),
    ])

    // Filter to files outside dist/external
    const nonExternalFiles = allDistFiles.filter(
      file => !file.startsWith(distExternalDir),
    )

    // Should have files to check
    expect(nonExternalFiles.length).toBeGreaterThan(0)
    expect(devDependencies.length).toBeGreaterThan(0)

    const violations: Array<{ file: string; packages: string[] }> = []

    const checkPromises = nonExternalFiles.map(async file => {
      const content = await fs.readFile(file, 'utf8')
      const relativePath = path.relative(distDir, file)
      const foundPackages: string[] = []

      // Check for require() or import statements of devDependencies
      for (const pkg of devDependencies) {
        // Escape special regex characters in package name
        const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        // Match require('pkg') or require("pkg") or from 'pkg' or from "pkg"
        const requirePattern = new RegExp(
          `(?:require\\s*\\(\\s*['"]${escapedPkg}['"]\\s*\\)|from\\s+['"]${escapedPkg}['"])`,
          'g',
        )

        if (requirePattern.test(content)) {
          foundPackages.push(pkg)
        }
      }

      if (foundPackages.length > 0) {
        violations.push({
          file: relativePath,
          packages: foundPackages,
        })
      }
    })

    await Promise.all(checkPromises)

    if (violations.length > 0) {
      const errorMessage = [
        'Found devDependency imports outside dist/external:',
        ...violations.map(
          v =>
            `  - ${v.file}:\n    ${v.packages.map(p => `require('${p}')`).join(', ')}`,
        ),
        '',
        'devDependencies should only be bundled in dist/external.',
        'These files should import from dist/external or have the imports rewritten during build.',
      ].join('\n')

      expect.fail(errorMessage)
    }
  })
})
