/* eslint-disable complexity */
/* eslint-disable no-empty */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TPunctuation } from '../../tokenizer/nodes/punctuation.node'
import type { TNodeData } from '../../tokenizer/types'
import type { NodeIterator } from '../iterator'
import { Token } from '../token'
import type { TDeclorations, TExpect, THandler, TTokenizedAttrs, TTransformedNode } from '../types'

export const identifier = (...text: string[]) =>
  $token('identifier', text.length > 0 ? text : undefined)
export const text = (...text: string[]) => $token('text', text.length > 0 ? text : undefined)
export const block = (...text: Array<'{}' | '()' | '[]'>) =>
  $token('block', text.length > 0 ? text.map(v => v[0]) : undefined)
export const pun = (...text: TPunctuation[]) =>
  $token('punctuation', text.length > 0 ? text : undefined)

export function $token(name: TNodeData['node'], text?: string[]) {
  const opts = {
    optional: false,
    as: undefined as TTokenizedAttrs | undefined,
    flag: undefined as string | undefined,
    skip: undefined as string[] | undefined,
    unique: undefined as string | undefined,
    expect: [{ node: name, text }] as TExpect[],
    isGlobal: false,
    empty: false,
    wrap: undefined as TTransformedNode['entity'] | undefined,
    wrapMultiple: false,
    debug: false,
  }
  return {
    expect: [{ node: name, text }] as TExpect[],
    handler(ni: NodeIterator, target: TTransformedNode, declarations: TDeclorations) {
      if (opts.debug) {
        // eslint-disable-next-line no-debugger
        debugger
      }
      let firstRun = true
      while (firstRun || opts.wrapMultiple) {
        firstRun = false
        if (!ni.$) {
          return opts.optional
        }
        if (ni.satisfies(...opts.expect)) {
          if (opts.empty && ni.$.children?.length) {
            ni.error(`Expected empty block`)
            return opts.optional
          }
          if (opts.as) {
            target[opts.as] = new Token(ni.$)
          }
          if (opts.flag) {
            target.flags.set(opts.flag, new Token(ni.$))
          }
          if (opts.unique) {
            const key = opts.unique
            declarations[key] = declarations[key] || new Set<string>()
            const storage = declarations[key]
            if (storage.has(ni.$.text)) {
              ni.error(`Duplicate ${key} "${ni.$.text}"`)
            } else {
              storage.add(ni.$.text)
            }
          } else if (opts.isGlobal && declarations.$reserved?.has(ni.$.text)) {
            ni.error(`Reserved identifier "${ni.$.text}"`)
          } else {
            ni.accepted()
          }
          if (opts.wrap) {
            const newTarget = { ...target }
            target.entity = opts.wrap
            target.flags = new Map()
            target.token = new Token(ni.$)
            target.annotations = {}
            target.definition = newTarget
          }
          ni.move()
          if (opts.skip) {
            ni.skip(opts.skip)
          }
          if (opts.wrapMultiple) {
            continue
          } else {
            return true
          }
        } else {
          if (!opts.optional) {
            ni.error(`Unexpected token`)
          }
          return opts.optional
        }
      }
      return true
    },
    as(value: TTokenizedAttrs) {
      opts.as = value
      return this
    },
    asFlag(v: string) {
      opts.flag = v
      return this
    },
    wrap(entity: TTransformedNode['entity'], multiple = false) {
      opts.wrap = entity
      opts.wrapMultiple = multiple
      return this
    },
    optional() {
      opts.optional = true
      return this
    },
    empty() {
      opts.empty = true
      return this
    },
    skip(...p: TPunctuation[]) {
      opts.skip = p
      return this
    },
    or(t: { expect: TExpect[] }) {
      opts.expect.push(...t.expect)
      return this
    },
    unique(key: string) {
      opts.unique = key
      return this
    },
    global() {
      opts.isGlobal = true
      return this
    },
    debug() {
      opts.debug = true
      return this
    },
  }
}
