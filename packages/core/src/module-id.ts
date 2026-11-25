import { createHash } from 'crypto'
import { readFileSync, statSync } from 'fs'
import path from 'path'

import { type AtscriptDoc, documentsEpoch } from './document'
import { fileUriToPath } from './parser/utils'

/**
 * The package of each project root (see {@link moduleId}) and file directory (see
 * {@link packageOfFile}), by its absolute path, with the `package.json` files read for it and
 * their modification times (`-1`: absent) — read again once one of them changed (a package
 * renamed, a manifest added or removed), checked once per documents' epoch (`checked`).
 */
const packages = new Map<
  string,
  {
    scope: string
    /** the package's `name` (`undefined`: no named `package.json` above the root) */
    name: string | undefined
    dir: string
    manifests: Array<{ file: string; mtime: number }>
    checked: number
  }
>()

/**
 * The id of `doc`'s module, which orders the blocks of modules at one import depth: the name of
 * the package of its project root (the nearest `package.json` with a `name` above the `rootDir`
 * of its config) and its path in that package (`name:src/a.as`). Without such a package, a hash
 * of the project root's path relative to the nearest directory with a `package.json` (or of
 * nothing, without one) stands for the name (`#1f0c…:src/a.as`, the path relative to the project
 * root) — the same on every machine. Without an atscript config, the project root is the working
 * directory the build ran in.
 */
export function moduleId(doc: AtscriptDoc): string {
  const file = fileUriToPath(doc.id)
  const root = path.resolve(doc.config.rootDir ?? path.dirname(file))
  const pkg = packageAt(root)
  const known = ids.get(doc)
  if (known?.uri === doc.id && known.root === root && known.pkg === pkg) {
    return known.id
  }
  const id = `${pkg.scope}:${path.relative(pkg.dir, file).replaceAll('\\', '/')}`
  ids.set(doc, { uri: doc.id, root, pkg, id })
  return id
}

/** {@link moduleId} by document: valid for its URI, root and package entry. */
const ids = new WeakMap<AtscriptDoc, { uri: string; root: string; pkg: object; id: string }>()

/**
 * The package holding the file at path `file`: the name and directory of the nearest
 * `package.json` with a `name` above it, and the file's path in it (`src/a.as`) — `undefined`
 * without one.
 */
export function packageOfFile(
  file: string
): { name: string; dir: string; path: string } | undefined {
  const abs = path.resolve(file)
  const pkg = packageAt(path.dirname(abs))
  if (pkg.name === undefined) {
    return undefined
  }
  return { name: pkg.name, dir: pkg.dir, path: path.relative(pkg.dir, abs).replaceAll('\\', '/') }
}

/** {@link packageOf} directory `root`, cached until one of the manifests it read changes. */
function packageAt(root: string) {
  const epoch = documentsEpoch()
  let pkg = packages.get(root)
  if (!pkg || (pkg.checked !== epoch && pkg.manifests.some(m => mtimeOf(m.file) !== m.mtime))) {
    pkg = { ...packageOf(root), checked: epoch }
    packages.set(root, pkg)
  }
  pkg.checked = epoch
  return pkg
}

/** The package of directory `root` (a project root, see {@link moduleId}). */
function packageOf(root: string) {
  const manifests: Array<{ file: string; mtime: number }> = []
  let unnamed: string | undefined
  for (let dir = root; ; dir = path.dirname(dir)) {
    const file = path.join(dir, 'package.json')
    const mtime = mtimeOf(file)
    manifests.push({ file, mtime })
    const name = mtime >= 0 ? packageName(file) : undefined
    if (name) {
      return { scope: name, name, dir, manifests }
    }
    if (mtime >= 0) {
      unnamed ??= dir
    }
    if (path.dirname(dir) === dir) {
      break
    }
  }
  const base = unnamed ?? root
  const relative = path.relative(base, root).replaceAll('\\', '/')
  const scope = `#${createHash('sha256').update(relative).digest('hex').slice(0, 12)}`
  return { scope, name: undefined, dir: root, manifests }
}

/** The modification time of `file` (`-1`: it does not exist). */
function mtimeOf(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return -1
  }
}

/** The `name` of package manifest `file`, if it exists and has one. */
function packageName(file: string): string | undefined {
  try {
    const name = (JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown }).name
    return typeof name === 'string' && name ? name : undefined
  } catch {
    return undefined
  }
}
