/* eslint-disable complexity */
/* eslint-disable no-empty */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TPunctuation } from '../../tokenizer/nodes/punctuation.node'
import type { TNodeData } from '../../tokenizer/types'
import type { NodeIterator } from '../iterator'
import { Token } from '../token'
import type { TDeclorations, TExpect, TTokenizedAttrs, TTransformedNode } from '../types'

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
  }
  return {
    expect: [{ node: name, text }] as TExpect[],
    handler(ni: NodeIterator, target: TTransformedNode, declarations: TDeclorations) {
      if (!ni.$) {
        return false
      }
      if (ni.satisfies(...opts.expect)) {
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
        ni.move()
        if (opts.skip) {
          ni.skip(opts.skip)
        }
        return true
      } else {
        if (!opts.optional) {
          ni.error(
            `Unexpected token. Expected ${opts.expect
              .filter(v => v.text)
              .map(v =>
                [v.text]
                  .flat()
                  .map(v => `"${v}"`)
                  .join(' or ')
              )
              .join(' or ')}`
          )
        }
        return opts.optional
      }
    },
    as(value: TTokenizedAttrs) {
      opts.as = value
      return this
    },
    asFlag(v: string) {
      opts.flag = v
      return this
    },
    optional() {
      opts.optional = true
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
  }
}
