import {
  AtscriptDoc,
  isGroup,
  isRef,
  SemanticImportNode,
  SemanticInterfaceNode,
  SemanticNode,
  SemanticRefNode,
  SemanticTypeNode,
} from '@atscript/core'
import { CodePrinter } from './code-printer'

export class BaseRenderer extends CodePrinter {
  unused: Set<string>

  constructor(protected readonly doc: AtscriptDoc) {
    super()
    this.unused = new Set(this.doc.getUnusedTokens().map(t => t.text))
  }

  pre() {}

  post() {}

  render(): string {
    this.pre()

    for (const node of this.doc.nodes) {
      this.renderNode(node)
    }

    this.post()
    return this.toString()
  }

  renderInterface(node: SemanticInterfaceNode) {}
  renderType(node: SemanticTypeNode) {}

  transformFromPath(path: string): string {
    return path + '.as'
  }

  renderImport(node: SemanticImportNode) {
    const def = node.getDefinition()
    const refs = [] as string[]
    const from = this.transformFromPath(node.token('path')!.text)
    let isUnusedImport = true
    if (isGroup(def)) {
      for (const child of def.unwrap()) {
        if (isRef(child) && !this.unused.has(child.id!)) {
          const node = child as SemanticRefNode
          refs.push(node.id!)
          isUnusedImport = false
        }
      }
    } else if (isRef(def) && !this.unused.has(def.id!)) {
      refs.push(def.id!)
      isUnusedImport = false
    }
    if (!isUnusedImport) {
      this.writeln(`import { ${refs.join(', ')} } from "${from}"`)
    }
  }

  renderNode(node: SemanticNode) {
    switch (node.entity) {
      case 'interface': {
        this.renderInterface(node as SemanticInterfaceNode)
        break
      }
      case 'type': {
        this.renderType(node as SemanticTypeNode)
        break
      }
      case 'import': {
        this.renderImport(node as SemanticImportNode)
        break
      }
      default: {
        break
      }
    }
  }
}
