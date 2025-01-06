/* eslint-disable unicorn/switch-case-braces */
/* eslint-disable complexity */
/* eslint-disable max-depth */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TPunctuation } from '../../tokenizer/tokens/punctuation.token'
import type { TLexicalToken } from '../../tokenizer/types'
import type { NodeIterator } from '../iterator'
import type { SemanticNode, TNodeEntity } from '../nodes'
import { $n } from '../nodes'
import type { TDeclorations, THandler } from '../types'
import { $token } from './tokens.pipe'

export interface TPipe {
  targetFactory: () => SemanticNode
  pipe: Array<{ handler: THandler }>
  skipTokens: TPunctuation[]
  toString: () => string
  stopCondition?: (ni: NodeIterator) => boolean
}

export function $pipe(entity: TNodeEntity, pipe: TPipe['pipe'] = []) {
  pipe.forEach((p, i) => Object.assign(p, { toString: () => `${entity}.${i}` }))
  return {
    targetFactory: () => {
      switch (entity) {
        case 'interface':
          return new $n.SemanticInterfaceNode()
        case 'array':
          return new $n.SemanticArrayNode()
        case 'const':
          return new $n.SemanticConstNode()
        case 'group':
          return new $n.SemanticGroup()
        case 'prop':
          return new $n.SemanticPropNode()
        case 'type':
          return new $n.SemanticTypeNode()
        case 'ref':
          return new $n.SemanticRefNode()
        case 'structure':
          return new $n.SemanticStructureNode()
        case 'tuple':
          return new $n.SemanticTupleNode()
      }
    },
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
    t(node: TLexicalToken['type'], skip: TPunctuation[] = []) {
      this.pipe.push(
        $token(node)
          .saveAs('identifier')
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
  const nodes: SemanticNode[] = []
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
    let depth = ni.index
    for (const { targetFactory, pipe, skipTokens: skip, stopCondition } of pipes) {
      const target = { node: targetFactory() }
      const fork = ni.fork()
      fork.skip(skip)
      if (!fork.$) {
        ni.unfork(fork)
        break
      }
      matched = true
      const _declarations = clone(declarations)
      for (const { handler } of pipe) {
        if (!handler(fork, target, _declarations)) {
          matched = false
          break
        }
      }
      if (fork.index > depth) {
        depth = fork.index
      }
      if (matched) {
        nodes.push(target.node)
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
    if (!matched) {
      ni.shouldHaveError(depth)
      ni.move(depth - ni.index)
    }
    ni.move()
    if (matched) {
      //
    } else {
      ni.confirmIssues()
      // after error skip the whole line;
      ni.skipUntil([';', '\n'])
    }
  }
  return nodes
}

export function runPipesOnce(pipes: TPipe[], _ni: NodeIterator): SemanticNode | undefined {
  return runPipes(pipes, _ni, true)[0]
}
