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
  stopCondition?: (ni: NodeIterator) => boolean
}

export function $pipe(entity: TTransformedNode['entity'], pipe: TPipe['pipe'] = []) {
  return {
    targetFactory: () => ({ entity, flags: new Map() }) as TTransformedNode,
    pipe,
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

// eslint-disable-next-line sonarjs/cognitive-complexity
export function runPipes(pipes: TPipe[], _ni: NodeIterator, singlePass = false) {
  let ni = _ni
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
    for (const { targetFactory, pipe, skipTokens: skip, stopCondition } of pipes) {
      const target = targetFactory()
      const fork = ni.fork()
      fork.skip(skip)
      let matched = true
      for (const { handler } of pipe) {
        if (!handler(fork, target, declarations)) {
          matched = false
          break
        }
      }
      if (matched) {
        nodes.push(target)
        ni = fork
        if (stopCondition && stopCondition(fork)) {
          return nodes
        }
        ni.move(-1)
        break
      }
    }
    ni.move()
    if (singlePass) {
      return nodes
    }
  }
  return nodes
}

export function runPipesOnce(pipes: TPipe[], _ni: NodeIterator): TTransformedNode | undefined {
  return runPipes(pipes, _ni, true)[0]
}
