/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { SemanticNode } from './parser/nodes'
import { isInterface, isType } from './parser/nodes'
import type { Token } from './parser/token'

export interface TEnvironmentOpts {
  primitives: Array<Omit<TEnvironmentItem, 'type' | 'node' | 'docId' | 'array'>>
}

export interface TEnvironmentItem {
  docId: string
  identifier: string
  type: 'primitive' | 'tuple' | 'const' | 'group' | 'structure'
  node: SemanticNode
  array?: boolean
  label?: string
  description?: string
  documentation?: string
  props?: string
}

export class Environment {
  primitives: Array<Omit<TEnvironmentItem, 'node' | 'docId'>>

  docs = new Map<string, TEnvironmentItem[]>()

  allItems: TEnvironmentItem[] = []

  constructor(opts?: TEnvironmentOpts) {
    this.primitives = opts?.primitives.map(p => ({ ...p, type: 'primitive' })) ?? []
  }

  getDoc(id: string) {
    const d = this.docs.get(id)
    if (!d) {
      const newDoc = [] as TEnvironmentItem[]
      this.docs.set(id, newDoc)
      return newDoc
    }
    return d
  }

  refresh(docId: string) {
    this.docs.delete(docId)
    this.allItems = this.allItems.filter(i => i.docId !== docId)
  }

  register(docId: string, node: SemanticNode) {
    if (isInterface(node)) {
      const doc = this.getDoc(docId)
      const item = {
        docId,
        identifier: node.identifier!,
        node,
        type: 'structure',
      } as TEnvironmentItem
    } else if (isType(node)) {
      const item = {
        docId,
        identifier: node.identifier!,
        node,
        type: 'primitive',
      } as TEnvironmentItem
    }
  }
}
