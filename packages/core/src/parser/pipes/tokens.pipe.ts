/* eslint-disable complexity */
/* eslint-disable no-empty */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TPunctuation } from '../../tokenizer/tokens/punctuation.token'
import type { TLexicalToken } from '../../tokenizer/types'
import type { NodeIterator } from '../iterator'
import type { SemanticNode, TSemanticToken } from '../nodes'
import { Token } from '../token'
import type { TExpect, TTarget } from '../types'

export const identifier = (...text: string[]) =>
  $token('identifier', text.length > 0 ? text : undefined)
export const text = (...text: string[]) => $token('text', text.length > 0 ? text : undefined)
export const block = (...text: Array<'{}' | '()' | '[]'>) =>
  $token('block', text.length > 0 ? text.map(v => v[0]) : undefined)
export const pun = (...text: TPunctuation[]) =>
  $token('punctuation', text.length > 0 ? text : undefined)

export function $token(name: TLexicalToken['type'], text?: string[]) {
  const opts = {
    optional: false,
    saveAs: undefined as TSemanticToken | undefined,
    skip: undefined as string[] | undefined,
    expect: [{ node: name, text }] as TExpect[],
    contains: undefined as TExpect[] | undefined,
    isGlobal: false,
    empty: false,
    wrapper: undefined as (() => SemanticNode) | undefined,
    wrapMultiple: false,
    debug: false,
    eob: false, // end of block
    suppressEobError: false,
    lookBehind: false,
  }
  return {
    expect: [{ node: name, text }] as TExpect[],
    handler(ni: NodeIterator, target: TTarget) {
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
          if (opts.contains) {
            if (!ni.$.children?.length) {
              ni.unexpected(false, `Expected ${opts.contains.map(v => v.text).join(', ')}`)
              return opts.optional
            }
            if (
              ni.$.children[0].type !== opts.contains[0].node ||
              ni.$.children[0].text !== opts.contains[0].text
            ) {
              ni.unexpected(false, `Expected ${opts.contains.map(v => v.text).join(', ')}`)
              return opts.optional
            }
          }
          if (opts.saveAs) {
            target.node.saveToken(new Token(ni.$), opts.saveAs)
          }
          ni.accepted()
          if (opts.wrapper) {
            const wrapped = target.node
            target.node = opts.wrapper().wrap(wrapped, new Token(ni.$))
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
    saveAs(v: TSemanticToken) {
      opts.saveAs = v
      return this
    },
    wrap(sn: () => SemanticNode, multiple = false) {
      opts.wrapper = sn
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
    contains(t: { expect: TExpect[] }) {
      opts.contains = t.expect
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
