import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import type { AtscriptDoc, SemanticInterfaceNode } from '@atscript/core'

import { TypeRenderer } from '../codegen'
import type { TTsPluginOptions } from '../plugin'

/** A path of a `.d.ts` `static __flat` (or `__ownProps`). */
export interface TDtsFlatEntry {
  optional: boolean
  /** Its TS type (`never`: an intermediate path). */
  type: string
  /**
   * Typed `string`, as a `@db.json` field is (decisive at a path declared an object or array:
   * a string field is `string` too).
   */
  dbJson: boolean
}

/**
 * The `static __flat` (or `__ownProps`) block of `.d.ts` text: its paths with their TS types
 * (`undefined`: no such block).
 */
export function flatBlock(
  text: string,
  block: '__flat' | '__ownProps' = '__flat'
): Map<string, TDtsFlatEntry> | undefined {
  const lines = text.split('\n')
  const at = lines.findIndex(l => l.trim() === `static ${block}: {`)
  if (at < 0) {
    return undefined
  }
  const indent = `${/^\s*/.exec(lines[at])![0]}  `
  const out = new Map<string, TDtsFlatEntry>()
  let last: TDtsFlatEntry | undefined
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '}' && line.length - line.trimStart().length < indent.length) {
      break
    }
    const entry = /^"((?:[^"\\]|\\.)*)"(\??): (.*)$/.exec(line.slice(indent.length))
    if (entry && line.startsWith(`${indent}"`)) {
      last = {
        optional: entry[2] === '?',
        type: entry[3],
        dbJson: /^string( \| null)?$/.test(entry[3]),
      }
      out.set(entry[1], last)
    } else if (last) {
      last.type += `\n${line.trim()}`
    }
  }
  return out
}

/**
 * The `__flat` (or `__ownProps`) map the `.d.ts` renders for interface `name` of `doc`, a DB
 * entity or not (the renderer's flat-map path, as for a `@db.table`); `undefined`: not rendered
 * (the type does not evaluate at build time).
 */
export function dtsFlat(
  doc: AtscriptDoc,
  name: string,
  opts?: TTsPluginOptions,
  block: '__flat' | '__ownProps' = '__flat'
): Map<string, TDtsFlatEntry> | undefined {
  const node = doc.nodes.find(n => n.entity === 'interface' && n.id === name)
  if (!node) {
    throw new Error(`no interface ${name}`)
  }
  const renderer = new TypeRenderer(doc, opts)
  ;(renderer as unknown as { renderFlatMaps(n: SemanticInterfaceNode): void }).renderFlatMaps(
    node as SemanticInterfaceNode
  )
  return flatBlock(renderer.toString(), block)
}

/** The error messages of a build of `files` (`@db.*` annotations allowed without a spec). */
export async function buildErrors(files: Record<string, string>): Promise<string[]> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-build-errors-'))
  try {
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(path.join(dir, name), text)
    }
    const repo = await build({
      rootDir: dir,
      entries: Object.keys(files),
      unknownAnnotation: 'allow',
    })
    const diagnostics = await repo.diagnostics()
    return [...diagnostics.values()]
      .flat()
      .filter(m => m.severity === 1)
      .map(m => m.message)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The paths of {@link dtsFlat} (`[]`: not rendered). */
export function dtsFlatKeys(doc: AtscriptDoc, name: string, opts?: TTsPluginOptions): string[] {
  return [...(dtsFlat(doc, name, opts)?.keys() ?? [])]
}
