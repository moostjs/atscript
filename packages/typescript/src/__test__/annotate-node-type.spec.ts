import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { AnnotationSpec, build } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * The node type of an annotation written at the top of an `annotate` block (before the keyword)
 * is its target's — an interface or a type, through `annotate … as` aliases to theirs — unless the
 * annotation's spec lists `'annotate'` itself. Exhaustively: every spec node type list × mutating
 * and non-mutating blocks × targets (an interface, a type, an alias of each) declared in the
 * module or imported; the entries of the blocks keep the node type of a prop.
 */

const NODE_TYPES: string[][] = [
  ['interface', 'type'],
  ['interface'],
  ['type'],
  ['prop'],
  ['annotate'],
  ['interface', 'annotate'],
  ['type', 'prop'],
]

/** The targets: name → its entity at the end of its aliases. */
const TARGETS: Record<string, 'interface' | 'type'> = {
  LI: 'interface',
  LT: 'type',
  LIA: 'interface',
  LTA: 'type',
  RI: 'interface',
  RT: 'type',
  RIA: 'interface',
  RTA: 'type',
}

const LIB = `export interface RI {
  a: number
}
export type RT = {
  a: number
}
export annotate RI as RIA {
  a
}
export annotate RT as RTA {
  a
}
`

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('top-level annotations of an annotate block take the node type of its target', () => {
  for (const nodeType of NODE_TYPES) {
    it(`a spec for ${nodeType.join(', ')}`, async () => {
      const lines = [
        "import { RI, RT, RIA, RTA } from './lib'",
        'export interface LI {',
        '  a: number',
        '}',
        'export type LT = {',
        '  a: number',
        '}',
        'export annotate LI as LIA {',
        '  a',
        '}',
        'export annotate LT as LTA {',
        '  a',
        '}',
      ]
      /** The line of each top-level annotation and of each entry annotation, with the expectation. */
      const expected = new Map<number, boolean>()
      let n = 0
      for (const [target, entity] of Object.entries(TARGETS)) {
        for (const mutating of [true, false]) {
          const reported = !nodeType.includes('annotate') && !nodeType.includes(entity)
          expected.set(lines.length, reported)
          lines.push('@x.top')
          lines.push(mutating ? `annotate ${target} {` : `export annotate ${target} as A${n++} {`)
          // an entry: a prop
          expected.set(lines.length, !nodeType.includes('prop'))
          lines.push('  @x.top')
          lines.push('  a', '}')
        }
      }
      const dir = mkdtempSync(path.join(tmpdir(), 'atscript-annotate-node-type-'))
      dirs.push(dir)
      writeFileSync(path.join(dir, 'lib.as'), LIB)
      writeFileSync(path.join(dir, 'main.as'), lines.join('\n'))
      const repo = await build({
        rootDir: dir,
        entries: ['main.as', 'lib.as'],
        plugins: [tsPlugin()],
        annotations: {
          x: { top: new AnnotationSpec({ nodeType: nodeType as any, multiple: true }) },
        },
      })
      const reported = new Set(
        [...(await repo.diagnostics()).entries()]
          .filter(([id]) => id.endsWith('main.as'))
          .flatMap(([, msgs]) => msgs)
          .filter(m => m.severity === 1 && m.message.includes('applies only to'))
          .map(m => m.range.start.line)
      )
      const errors = [...(await repo.diagnostics()).values()]
        .flat()
        .filter(m => m.severity === 1 && !m.message.includes('applies only to'))
      expect(errors.map(m => m.message)).toEqual([])
      for (const [line, report] of expected) {
        expect([line, lines[line], lines[line + 1], reported.has(line)]).toEqual([
          line,
          lines[line],
          lines[line + 1],
          report,
        ])
      }
      expect(reported.size).toBe([...expected.values()].filter(Boolean).length)
      // (MODEL §12 Q8: a module with error diagnostics is not generated — main.as reports the
      // misplaced annotations; it was generated, applying the top-level annotations anyway)
      if (reported.size > 0) {
        await expect(repo.generate({ format: 'js' })).rejects.toThrow('applies only to')
      } else {
        const js = (await repo.generate({ format: 'js' })).find(f => f.source.endsWith('main.as'))!
        expect(js.content).toBeTruthy()
      }
    })
  }
})
