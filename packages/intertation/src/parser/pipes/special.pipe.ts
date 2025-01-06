/* eslint-disable max-depth */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { T } from 'vitest/dist/chunks/environment.LoooBwUu'

import type { TPunctuation } from '../../tokenizer/nodes/punctuation.node'
import { groupByPriority } from '../grouping'
import type { NodeIterator } from '../iterator'
import { Token } from '../token'
import type {
  TExpect,
  TTarget,
  TTokenizedAttrs,
  TTransformedAnnotation,
  TTransformedNode,
} from '../types'
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
    handler(ni: NodeIterator, target: TTarget) {
      if (!ni.$) {
        return false
      }
      while (ni.satisfies(opts.annotation)) {
        target.node.annotations = target.node.annotations || {}
        const a = {
          token: new Token(ni.$),
          args: [],
        } as TTransformedAnnotation
        const key = ni.$.text.slice(1)
        if (target.node.annotations[key]) {
          ni.unexpected(false, 'Duplicate annotation')
        } else {
          ni.accepted()
        }
        target.node.annotations[key] = a
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
          ni.unexpected(false, `Unexpected token in annotation ${ni.toString()}`)
          ni.skipUntil([';', '\n'])
          ni.skip([';', '\n'])
          // go with next line expecting another annotation
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
    pop: false, // pop definition and set it as a target
    skip: [] as TPunctuation[],
  }
  return {
    handler(ni: NodeIterator, target: TTarget) {
      const targetNode = target.node
      if (opts.debug) {
        // eslint-disable-next-line no-debugger
        debugger
      }
      if (!ni.$ && !opts.from) {
        return false
      }
      if (opts.from && !targetNode[opts.from]) {
        ni.unexpected(false, `Unexpected definition`)
        return false
      }
      const fork = opts.from ? ni.fork(targetNode[opts.from]?.children) : ni
      if (opts.from && !fork.nodesLeft()) {
        targetNode.definition = {
          isGroup: true,
          nodes: [],
        }
        if (opts.pop) {
          fork.unexpectedEOB()
          return false
        }
        return true
      }
      const resolvedPipes = pipes.map(p => (typeof p === 'function' ? p() : p))
      const node = runPipesOnce(resolvedPipes, fork)
      if (node) {
        fork.accepted()
        fork.move()
        fork.skip(opts.skip)
        if (!opts.multiple) {
          targetNode.definition = node
          if (opts.pop) {
            target.node = targetNode.definition
          }
          return true
        }
      } else {
        fork.unexpected()
        return false
      }
      const nodes = [node] as Array<TTransformedNode | Token>
      while (opts.multiple && fork.$) {
        if (opts.sep.length > 0) {
          if (fork.satisfies({ node: 'punctuation', text: opts.sep })) {
            // keep going
            if (opts.priority) {
              if (fork.next(opts.skip).$) {
                nodes.push(new Token(fork.$))
              } else {
                fork.unexpected(false, 'Unexpected end of group')
                break
              }
            }
            fork.accepted()
            fork.move()
            fork.skip(opts.skip)
          } else {
            // finished
            if (fork.$) {
              fork.unexpected()
            }
            break
          }
        }
        const nextNode = runPipesOnce(resolvedPipes, fork)
        if (nextNode) {
          nodes.push(nextNode)
          fork.accepted()
          fork.move()
          fork.skip(opts.skip)
        } else {
          fork.unexpected()
          return false
        }
      }
      if (nodes.length === 1) {
        targetNode.definition = nodes[0] as TTransformedNode
      } else if (opts.priority && opts.sep.length > 0) {
        if (nodes.length % 2 === 0) {
          fork.next().unexpected(false, 'Error in group definition')
          return false
        }
        targetNode.definition = groupByPriority(nodes, opts.sep)
      } else {
        targetNode.definition = {
          isGroup: true,
          nodes: nodes as TTransformedNode[],
        }
      }
      if (opts.pop) {
        target.node = targetNode.definition as TTransformedNode
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
    skip(...skip: TPunctuation[]) {
      opts.skip = skip
      return this
    },
    debug() {
      opts.debug = true
      return this
    },
    pop() {
      opts.pop = true
      return this
    },
  }
}

export function unwrap(attr: TTokenizedAttrs) {
  const opts = {
    pipes: [] as TPipe[],
  }
  return {
    handler(ni: NodeIterator, target: TTarget) {
      if (!target.node[attr]) {
        return false
      }
      const token = target.node[attr]
      const fork = ni.fork(token.children || [])
      const nodes = runPipes(opts.pipes, fork)
      target.node.definition = {
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
