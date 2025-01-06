/* eslint-disable complexity */
/* eslint-disable no-empty */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TPunctuation } from '../../tokenizer/nodes/punctuation.node'
import type { TNodeData } from '../../tokenizer/types'
import type { NodeIterator } from '../iterator'
import { Token } from '../token'
import type {
  TDeclorations,
  TExpect,
  THandler,
  TTarget,
  TTokenizedAttrs,
  TTransformedNode,
} from '../types'

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
    eob: false, // end of block
    suppressEobError: false,
    lookBehind: false,
  }
  return {
    expect: [{ node: name, text }] as TExpect[],
    handler(ni: NodeIterator, target: TTarget, declarations: TDeclorations) {
      if (opts.debug) {
        // eslint-disable-next-line no-debugger
        debugger
      }
      let firstRun = true
      while (firstRun || opts.wrapMultiple) {
        firstRun = false
        if (!ni.$) {
          const ok = opts.eob || opts.optional
          if (!ok && !opts.suppressEobError) {
            ni.unexpectedEOB()
          }
          return ok
        }
        let matched = ni.satisfies(...opts.expect)
        if (!matched && opts.lookBehind) {
          matched = ni
            .fork()
            .move(-1)
            .satisfies(...opts.expect)
          if (matched) {
            ni.move(-1)
          }
        }
        if (matched) {
          if (opts.empty && ni.$.children?.length) {
            ni.unexpected(false, `Expected empty block`)
            return opts.optional
          }
          if (opts.as) {
            target.node[opts.as] = new Token(ni.$)
          }
          if (opts.flag) {
            target.node.flags.set(opts.flag, new Token(ni.$))
          }
          if (opts.unique) {
            const key = opts.unique
            declarations[key] = declarations[key] || new Set<string>()
            const storage = declarations[key]
            if (storage.has(ni.$.text)) {
              ni.unexpected(false, `Duplicate ${key} "${ni.$.text}"`)
            } else {
              storage.add(ni.$.text)
              ni.accepted()
            }
          } else if (opts.isGlobal && declarations.$reserved?.has(ni.$.text)) {
            ni.unexpected(false, `Reserved identifier "${ni.$.text}"`)
          } else {
            ni.accepted()
          }
          if (opts.wrap) {
            const wrapped = target.node
            target.node = {
              entity: opts.wrap,
              flags: new Map(),
              token: new Token(ni.$),
              definition: wrapped,
            }
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
            ni.unexpected()
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
    orEob() {
      // end of block
      opts.eob = true
      return this
    },
    suppressEobError() {
      opts.suppressEobError = true
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
    lookBehind() {
      opts.lookBehind = true
      return this
    },
    debug() {
      opts.debug = true
      return this
    },
  }
}
