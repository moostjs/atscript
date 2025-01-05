/* eslint-disable complexity */
/* eslint-disable max-depth */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TPunctuation } from '../../tokenizer/nodes/punctuation.node'
import type { TNodeData } from '../../tokenizer/types'
import type { NodeIterator } from '../iterator'
import type { TDeclorations, THandler, TTransformedNode } from '../types'
import { $token } from './tokens.pipe'

export interface TPipe {
  targetFactory: () => TTransformedNode
  pipe: Array<{ handler: THandler }>
  skipTokens: TPunctuation[]
  toString: () => string
  stopCondition?: (ni: NodeIterator) => boolean
}

export function $pipe(entity: TTransformedNode['entity'], pipe: TPipe['pipe'] = []) {
  pipe.forEach((p, i) => Object.assign(p, { toString: () => `${entity}.${i}` }))
  return {
    targetFactory: () => ({ entity, flags: new Map() }) as TTransformedNode,
    pipe,
    toString: () => entity,
    skipTokens: [] as TPipe['skipTokens'],
    stopCondition: undefined as TPipe['stopCondition'],
    skip(...s: TPunctuation[]) {
      this.skipTokens.push(...s)
      return this
    },
    stop(sc: TPipe['stopCondition']) {
      this.stopCondition = sc
      return this
    },
    t(node: TNodeData['node'], skip: TPunctuation[] = []) {
      this.pipe.push(
        $token(node)
          .as('token')
          .skip(...skip)
      )
      return this
    },
  }
}

function clone(declarations: TDeclorations): TDeclorations {
  const _declarations = {} as TDeclorations
  for (const [key, d] of Object.entries(declarations)) {
    _declarations[key] = new Set(d?.keys())
  }
  return _declarations
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function runPipes(pipes: TPipe[], ni: NodeIterator, singlePass = false) {
  const nodes: TTransformedNode[] = []
  const declarations = {
    $reserved: new Set([
      'string',
      'number',
      'boolean',
      'any',
      'void',
      'unknown',
      'never',
      'interface',
      'type',
      'public',
      'private',
      'protected',
      'class',
      'function',
    ]),
  } as TDeclorations
  while (ni.$) {
    let matched = true
    for (const { targetFactory, pipe, skipTokens: skip, stopCondition } of pipes) {
      const target = targetFactory()
      const fork = ni.fork()
      fork.skip(skip)
      matched = true
      const _declarations = clone(declarations)
      for (const { handler } of pipe) {
        if (!handler(fork, target, _declarations)) {
          matched = false
          break
        }
      }
      if (matched) {
        nodes.push(target)
        ni.unfork(fork)
        for (const [key, d] of Object.entries(_declarations)) {
          declarations[key] = d
        }
        if (stopCondition && stopCondition(fork)) {
          return nodes
        }
        ni.move(-1)
        break
      }
    }
    if (singlePass) {
      return nodes
    }
    ni.move()
    if (matched) {
      //
    } else {
      // after error skip the whole line;
      while (ni.$ && !ni.satisfies({ node: 'punctuation', text: ['\n', ';'] })) {
        ni.move()
      }
    }
  }
  return nodes
}

export function runPipesOnce(pipes: TPipe[], _ni: NodeIterator): TTransformedNode | undefined {
  return runPipes(pipes, _ni, true)[0]
}
