import {
  AnscriptDoc,
  SemanticInterfaceNode,
  SemanticStructureNode,
  TAnscriptPlugin,
  TAnscriptRenderContext,
  isImport,
  isInterface,
  isRef,
} from '@anscript/core'
import { TsArtifact } from './ts-gen/ts-artifact'
import { TsInterface } from './ts-gen/ts-interface'
import { TsStructure } from './ts-gen/ts-structure'

export const tsPlugin: () => TAnscriptPlugin = () => {
  return {
    name: 'typesccript',
    render(doc, context) {
      return [
        {
          name: `${doc.name}.ts`,
          content: renderDocument(doc, context),
        },
      ]
    },
  } as TAnscriptPlugin
}

function renderDocument(doc: AnscriptDoc, context: TAnscriptRenderContext): string {
  const tsArtifacts = [] as TsArtifact[]
  for (const node of doc.nodes) {
    if (isImport(node)) {
      //
    } else if (isInterface(node)) {
      tsArtifacts.push(createInterface(node))
    }
  }
  return tsArtifacts.map(a => a.render()).join('\n\n')
}

function createInterface(node: SemanticInterfaceNode): TsInterface {
  const a = new TsInterface(
    'T' + node.id!,
    createStructure(node.getDefinition() as SemanticStructureNode)
  )

  return a
}

function createStructure(node: SemanticStructureNode): TsStructure {
  const s = new TsStructure()
  for (const prop of Array.from(node.props.values())) {
    const def = prop.getDefinition()
    if (isRef(def)) {
      s.addProp(prop.id!, def.id!)
    }
  }
  return s
}
