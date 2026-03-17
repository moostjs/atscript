import { access, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

/**
 * Returns true if the specifier is a bare specifier (not relative or absolute).
 * Bare specifiers: 'my-lib/user', '@org/pkg/models'
 * NOT bare: './user', '../shared', '/absolute/path'
 */
export function isBareSpecifier(specifier: string): boolean {
  return specifier[0] !== '.' && specifier[0] !== '/'
}

/**
 * Returns true if the document ID is a bare specifier placeholder.
 */
export function isBareId(id: string): boolean {
  return id.startsWith('bare:')
}

/**
 * Parse a bare specifier into package name and subpath.
 *
 * '@scope/pkg/sub/path' → { packageName: '@scope/pkg', subpath: './sub/path' }
 * 'pkg/sub'             → { packageName: 'pkg', subpath: './sub' }
 * 'pkg'                 → { packageName: 'pkg', subpath: '.' }
 */
export function parseBareSpecifier(specifier: string): { packageName: string; subpath: string } {
  if (specifier.startsWith('@')) {
    // Scoped package: @scope/name/...
    const firstSlash = specifier.indexOf('/')
    if (firstSlash === -1) {
      return { packageName: specifier, subpath: '.' }
    }
    const secondSlash = specifier.indexOf('/', firstSlash + 1)
    if (secondSlash === -1) {
      return { packageName: specifier, subpath: '.' }
    }
    return {
      packageName: specifier.slice(0, secondSlash),
      subpath: `./${specifier.slice(secondSlash + 1)}`,
    }
  }
  // Unscoped package: name/...
  const firstSlash = specifier.indexOf('/')
  if (firstSlash === -1) {
    return { packageName: specifier, subpath: '.' }
  }
  return {
    packageName: specifier.slice(0, firstSlash),
    subpath: `./${specifier.slice(firstSlash + 1)}`,
  }
}

/**
 * Resolve a subpath against a package.json `exports` field using the `atscript` condition.
 * Returns the resolved file path relative to the package directory, or undefined.
 */
export function resolvePackageExports(
  exports: unknown,
  subpath: string
): string | undefined {
  if (!exports || typeof exports !== 'object') {
    return undefined
  }

  const exportsMap = exports as Record<string, unknown>

  // The subpath in .as imports omits the .as extension, but exports keys include it
  const subpathWithExt = subpath === '.' ? '.' : `${subpath}.as`

  // Direct match
  const entry = exportsMap[subpathWithExt]
  if (entry) {
    return resolveExportEntry(entry)
  }

  // Wildcard pattern match: "./*.as" or "./*"
  for (const [pattern, value] of Object.entries(exportsMap)) {
    if (!pattern.includes('*')) {
      continue
    }
    const match = matchSubpathPattern(pattern, subpathWithExt)
    if (match !== undefined) {
      const resolved = resolveExportEntry(value)
      if (resolved) {
        return resolved.replaceAll('*', match)
      }
    }
  }

  return undefined
}

/**
 * Resolve a single export entry, checking for `atscript` condition.
 */
function resolveExportEntry(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    return entry
  }
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>
    // Check `atscript` condition first
    if (typeof obj['atscript'] === 'string') {
      return obj['atscript']
    }
    // Fallback to `default`
    if (typeof obj['default'] === 'string') {
      return obj['default']
    }
  }
  return undefined
}

/**
 * Match a subpath against a pattern with a single `*` wildcard.
 * Returns the matched wildcard portion, or undefined if no match.
 */
function matchSubpathPattern(pattern: string, subpath: string): string | undefined {
  const starIdx = pattern.indexOf('*')
  if (starIdx === -1) {
    return undefined
  }
  const prefix = pattern.slice(0, starIdx)
  const suffix = pattern.slice(starIdx + 1)
  if (
    subpath.startsWith(prefix) &&
    subpath.endsWith(suffix) &&
    subpath.length >= prefix.length + suffix.length
  ) {
    return subpath.slice(prefix.length, subpath.length - suffix.length)
  }
  return undefined
}

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

// Resolution cache: `${fromDir}\0${specifier}` → resolved absolute path or undefined
const resolveCache = new Map<string, string | undefined>()

/**
 * Clear the bare specifier resolution cache.
 * Call this when node_modules may have changed (e.g., after install).
 */
export function clearResolveBareCache(): void {
  resolveCache.clear()
}

/**
 * Resolve a bare specifier to an absolute file path.
 *
 * Algorithm:
 * 1. Parse specifier into packageName + subpath
 * 2. Walk up from `fromDir` looking for `node_modules/<packageName>/package.json`
 * 3. Check `exports` field for subpath with `atscript` condition
 * 4. Fallback: check if file exists at `node_modules/<pkg>/<subpath>.as`
 * 5. Resolve symlinks via `fs.realpath`
 *
 * @param specifier Bare specifier, e.g. 'my-lib/user' or '@org/pkg/models'
 * @param fromDir Absolute directory of the importing file
 * @returns Resolved absolute file path, or undefined if not found
 */
export async function resolveBareSpecifier(
  specifier: string,
  fromDir: string
): Promise<string | undefined> {
  const cacheKey = `${fromDir}\0${specifier}`
  if (resolveCache.has(cacheKey)) {
    return resolveCache.get(cacheKey)
  }

  const result = await _resolveBareSpecifier(specifier, fromDir)
  resolveCache.set(cacheKey, result)
  return result
}

async function _resolveBareSpecifier(
  specifier: string,
  fromDir: string
): Promise<string | undefined> {
  const { packageName, subpath } = parseBareSpecifier(specifier)

  // Walk up directory tree looking for node_modules/<packageName>
  let dir = fromDir
  const root = path.parse(dir).root

  while (true) {
    const pkgDir = path.join(dir, 'node_modules', packageName)
    const pkgJsonPath = path.join(pkgDir, 'package.json')

    if (await fileExists(pkgJsonPath)) {
      // Try to resolve via package.json exports
      try {
        const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf8'))
        if (pkgJson.exports) {
          const resolved = resolvePackageExports(pkgJson.exports, subpath)
          if (resolved) {
            const fullPath = path.resolve(pkgDir, resolved)
            if (await fileExists(fullPath)) {
              return resolveRealPath(fullPath)
            }
          }
        }
      } catch {
        // Invalid package.json, try fallback
      }

      // Fallback: direct file access
      const directPath = subpath === '.'
        ? path.join(pkgDir, 'index.as')
        : path.join(pkgDir, `${subpath.slice(2)}.as`)

      if (await fileExists(directPath)) {
        return resolveRealPath(directPath)
      }
    }

    // Move up one directory
    const parentDir = path.dirname(dir)
    if (parentDir === dir || dir === root) {
      break
    }
    dir = parentDir
  }

  return undefined
}

/**
 * Resolve symlinks to get the canonical path (important for pnpm).
 */
async function resolveRealPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath)
  } catch {
    return filePath
  }
}
