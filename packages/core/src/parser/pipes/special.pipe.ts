/* eslint-disable max-depth */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */

import type { TPunctuation } from '../../tokenizer/tokens/punctuation.token'
import { groupByPriority } from '../grouping'
import type { NodeIterator } from '../iterator'
import type { SemanticNode, TSemanticToken } from '../nodes'
import { $n, isRef } from '../nodes'
import { SemanticArrayNode } from '../nodes/array-node'
import { Token } from '../token'
import type { TExpect, TTarget } from '../types'
import type { TPipe } from './core.pipe'
import { runPipes, runPipesOnce } from './core.pipe'

export function refWithChain() {
  const s = {
    id: { node: 'identifier' } as TExpect,
    dot: { node: 'punctuation', text: '.' } as TExpect,
    block: { node: 'block', text: '[' } as TExpect,
    end: { node: 'punctuation', text: ';' } as TExpect,
  }
  return {
    handler(ni: NodeIterator, target: TTarget) {
      ni.skip(['\n'])
      if (!ni.$) {
        return false
      }
      if (ni.satisfies(s.id)) {
        ni.accepted()
        target.node.saveToken(new Token(ni.$), 'identifier')
      } else {
        return false
      }
      ni.move()
      // ni.skip(['\n'])
      if (ni.fork().skip(['\n']).satisfies(s.end)) {
        // after ";" return true
        ni.skip(['\n', ';'])
        return true
      }
      const fork = ni.fork()
      let isDot = fork.skip(['\n']).satisfies(s.dot)
      let isBlock = fork.satisfies(s.block)
      // const chain = [] as Token[]
      while (fork.$ && (isDot || isBlock)) {
        if (isBlock) {
          if (fork.$.children?.length === 0) {
            while (isBlock && fork.$.children?.length === 0) {
              // is array
              target.node = new SemanticArrayNode().wrap(target.node, new Token(fork.$))
              fork.move()
              fork.skip(['\n', ';'])
              isBlock = fork.satisfies(s.block)
            }
            ni.unfork(fork)
            return true
          } else if (fork.$.children?.length === 1 && fork.$.children[0].type === 'text') {
            // chaining
            if (isRef(target.node)) {
              target.node.addChain(new Token(fork.$.children[0]))
            }
          } else {
            return true
          }
        } else {
          fork.skip(['\n'])
          // eslint-disable-next-line no-lonely-if
          if (fork.next().satisfies(s.id)) {
            if (isRef(target.node)) {
              target.node.addDot(new Token(fork.$))
            }
            fork.move()
            if (isRef(target.node)) {
              target.node.addChain(new Token(fork.$))
            }
          } else {
            if (isRef(target.node)) {
              target.node.addDot(new Token(fork.$))
            }
            fork.unexpected()
            fork.move(1)
            fork.unexpected()
            ni.unfork(fork)
            ni.move()
            ni.skip([';', '\n'])
            return true
          }
        }
        fork.move()
        ni.unfork(fork)
        if (ni.fork().skip(['\n']).satisfies(s.end)) {
          // after ";" return true
          ni.skip(['\n', ';'])
          return true
        }
        isDot = fork.skip(['\n']).satisfies(s.dot)
        isBlock = fork.satisfies(s.block)
      }
      return true
    },
  }
}

export function annotations() {
  const opts = {
    annotation: { node: 'annotation' } as TExpect,
    argument: [
      { node: ['number', 'text'] },
      { node: 'identifier', text: ['true', 'false', 'undefined', 'null'] },
    ] as TExpect[],
    comma: { node: 'punctuation', text: ',' } as TExpect,
    end: { node: 'punctuation', text: [';', '\n'] } as TExpect,
  }

  return {
    handler(ni: NodeIterator, target: TTarget) {
      while (ni.$ && ni.satisfies(opts.annotation)) {
        const key = ni.$.text?.slice(1)
        if (target.node.hasAnnotation(key)) {
          ni.unexpected(false, 'Duplicate annotation')
        } else {
          ni.accepted()
        }
        const addArgument = target.node.annotate(key, new Token(ni.$))
        ni.move()
        while (ni.satisfies(opts.comma)) {
          addArgument(new Token(ni.$))
          ni.accepted()
          ni.move()
        }
        while (ni.satisfies(...opts.argument)) {
          addArgument(new Token(ni.$))
          ni.accepted()
          ni.move()
          if (ni.satisfies(opts.comma)) {
            ni.accepted()
            ni.move()
            while (ni.satisfies(opts.comma)) {
              addArgument(new Token(ni.$))
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
    from: undefined as TSemanticToken | undefined,
    debug: false,
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
      if (opts.from && !targetNode.has(opts.from)) {
        ni.unexpected(false, `Unexpected definition`)
        return false
      }
      const fork = opts.from ? ni.fork(targetNode.token(opts.from)?.children) : ni
      if (opts.from && !fork.nodesLeft()) {
        targetNode.define(new $n.SemanticGroup())
        // if (opts.pop) {
        //   fork.unexpectedEOB()
        //   return false
        // }
        return true
      }
      const resolvedPipes = pipes.map(p => (typeof p === 'function' ? p() : p))
      const node = runPipesOnce(resolvedPipes, fork)
      if (node) {
        fork.accepted()
        fork.move()
        fork.skip(opts.skip)
        if (!opts.multiple) {
          targetNode.define(node)
          return true
        }
      } else {
        fork.unexpected()
        return false
      }
      const nodes = [node] as Array<SemanticNode | Token>
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
        targetNode.define(nodes[0] as SemanticNode)
      } else if (opts.priority && opts.sep.length > 0) {
        if (nodes.length % 2 === 0) {
          fork.next().unexpected(false, 'Error in group definition')
          return false
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        targetNode.define(groupByPriority(nodes, opts.sep)!)
      } else {
        targetNode.define(new $n.SemanticGroup(nodes as SemanticNode[]))
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
    from(attr: TSemanticToken) {
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
  }
}

export function unwrap(attr: TSemanticToken) {
  const opts = {
    pipes: [] as TPipe[],
  }
  return {
    handler(ni: NodeIterator, target: TTarget) {
      if (!target.node.has(attr)) {
        return false
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const token = target.node.token(attr)!
      const fork = ni.fork(token.children || [])
      const nodes = runPipes(opts.pipes, fork)
      target.node.define(new $n.SemanticGroup(nodes))
      return true
    },
    with(pipes: TPipe[]) {
      opts.pipes = pipes
      return this
    },
  }
}
