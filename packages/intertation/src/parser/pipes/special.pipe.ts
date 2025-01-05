/* eslint-disable max-depth */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TPunctuation } from '../../tokenizer/nodes/punctuation.node'
import { groupByPriority } from '../grouping'
import type { NodeIterator } from '../iterator'
import { Token } from '../token'
import type { TExpect, TTokenizedAttrs, TTransformedAnnotation, TTransformedNode } from '../types'
import type { TPipe } from './core.pipe'
import { runPipes, runPipesOnce } from './core.pipe'

export function annotations() {
  const opts = {
    annotation: { node: 'annotation' } as TExpect,
    argument: { node: ['number', 'text'] } as TExpect,
    comma: { node: 'punctuation', text: ',' } as TExpect,
    end: { node: 'punctuation', text: [';', '\n'] } as TExpect,
  }
  return {
    handler(ni: NodeIterator, target: TTransformedNode) {
      if (!ni.$) {
        return false
      }
      while (ni.satisfies(opts.annotation)) {
        target.annotations = target.annotations || {}
        const a = {
          token: new Token(ni.$),
          args: [],
        } as TTransformedAnnotation
        const key = ni.$.text.slice(1)
        if (target.annotations[key]) {
          console.log(ni.toString(), ni.$.getRange())
          ni.error('Duplicate annotation')
        } else {
          ni.accepted()
        }
        target.annotations[key] = a
        ni.move()
        while (ni.satisfies(opts.comma)) {
          a.args.push(new Token(ni.$))
          ni.accepted()
          ni.move()
        }
        while (ni.satisfies(opts.argument)) {
          a.args.push(new Token(ni.$))
          ni.accepted()
          ni.move()
          if (ni.satisfies(opts.comma)) {
            ni.accepted()
            ni.move()
            while (ni.satisfies(opts.comma)) {
              a.args.push(new Token(ni.$))
              ni.accepted()
              ni.move()
            }
          } else {
            break
          }
        }
        if (ni.satisfies(opts.end)) {
          ni.skip([';', '\n'])
        } else if (ni.$) {
          ni.error(`Unexpected token in annotation ${ni.toString()}`)
          return true
        }
      }
      return true
    },
  }
}

export function definition(pipes: Array<TPipe | (() => TPipe)>) {
  const opts = {
    sep: [] as TPunctuation[],
    priority: false,
    multiple: false,
    from: undefined as TTokenizedAttrs | undefined,
    debug: false,
  }
  return {
    handler(ni: NodeIterator, target: TTransformedNode) {
      if (opts.debug) {
        // eslint-disable-next-line no-debugger
        debugger
      }
      if (!ni.$ && !opts.from) {
        return false
      }
      if (opts.from && !target[opts.from]) {
        ni.error(`Unexpected definition`)
        return false
      }
      const fork = opts.from ? ni.fork(target[opts.from]?.children) : ni
      if (opts.from && !fork.nodesLeft()) {
        target.definition = {
          isGroup: true,
          nodes: [],
        }
        return true
      }
      const resolvedPipes = pipes.map(p => (typeof p === 'function' ? p() : p))
      const node = runPipesOnce(resolvedPipes, fork)
      if (node) {
        fork.accepted()
        fork.move()
        if (!opts.multiple) {
          target.definition = node
          return true
        }
      } else {
        fork.error('Unexpected token')
        return false
      }
      const nodes = [node] as Array<TTransformedNode | Token>
      while (opts.multiple && fork.$) {
        if (opts.sep.length > 0) {
          if (fork.satisfies({ node: 'punctuation', text: opts.sep })) {
            // keep going
            if (opts.priority) {
              if (fork.next(['\n']).$) {
                nodes.push(new Token(fork.$))
              } else {
                fork.error('Unexpected end of group')
                break
              }
            }
            fork.accepted()
            fork.move()
          } else {
            // finished
            break
          }
        }
        const nextNode = runPipesOnce(resolvedPipes, fork)
        if (nextNode) {
          nodes.push(nextNode)
          fork.accepted()
          fork.move()
        } else {
          fork.error('Unexpected token')
          return false
        }
      }
      if (nodes.length === 1) {
        target.definition = nodes[0] as TTransformedNode
        return true
      }
      if (opts.priority && opts.sep.length > 0) {
        if (nodes.length % 2 === 0) {
          fork.next().error('Error in group definition')
          return false
        }
        target.definition = groupByPriority(nodes, opts.sep)
      } else {
        target.definition = {
          isGroup: true,
          nodes: nodes as TTransformedNode[],
        }
      }
      return true
    },
    separatedBy(...p: TPunctuation[]) {
      opts.multiple = true
      opts.sep.push(...p)
      return this
    },
    respectPriority() {
      opts.priority = true
      return this
    },
    multiple() {
      opts.multiple = true
      return this
    },
    from(attr: TTokenizedAttrs) {
      opts.from = attr
      return this
    },
    debug() {
      opts.debug = true
      return this
    },
  }
}

export function unwrap(attr: TTokenizedAttrs) {
  const opts = {
    pipes: [] as TPipe[],
  }
  return {
    handler(ni: NodeIterator, target: TTransformedNode) {
      if (!target[attr]) {
        return false
      }
      const token = target[attr]
      const fork = ni.fork(token.children || [])
      const nodes = runPipes(opts.pipes, fork)
      target.definition = {
        isGroup: true,
        nodes,
      }
      return true
    },
    with(pipes: TPipe[]) {
      opts.pipes = pipes
      return this
    },
  }
}
