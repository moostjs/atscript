/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AtscriptDoc } from '../../document'
import { isGroup, isRef } from '.'
import type { SemanticRefNode } from './ref-node'
import { SemanticNode } from './semantic-node'

export class SemanticAnnotateNode extends SemanticNode {
  constructor() {
    super('annotate')
  }

  // Entry refs are property references within the target interface,
  // similar to SomeInterface.someProp chain references.
  // They go into `referred` for navigation; getDiagMessages validates them
  // through the target interface instead of as top-level definitions.

  get isMutating(): boolean {
    return !this.token('identifier')
  }

  get targetName(): string {
    return this.token('target')!.text
  }

  get entries(): SemanticRefNode[] {
    if (!this.definition) {
      return []
    }
    if (isGroup(this.definition)) {
      return this.definition.unwrap().filter(n => isRef(n)) as SemanticRefNode[]
    }
    if (isRef(this.definition)) {
      return [this.definition]
    }
    return []
  }

  get id() {
    return this.token('identifier')?.text ?? this.targetName
  }

  registerAtDocument(doc: AtscriptDoc): void {
    const targetToken = this.token('target')!
    targetToken.isReference = true
    doc.referred.push(targetToken)
    doc.tokensIndex.add(targetToken)

    const identifierToken = this.token('identifier')
    if (identifierToken) {
      // Non-mutating: register identifier as definition
      doc.registerDefinition(identifierToken)
      if (this.token('export')) {
        identifierToken.exported = true
        doc.registerExport(this)
      }
    } else if (this.token('export')) {
      // Mutating with export: syntax error
      doc.registerMessage(
        this.token('export')!,
        'Cannot export mutating ad-hoc annotations block',
      )
    }

    const block = this.token('inner')
    if (block) {
      block.blockType = 'annotate'
      doc.blocksIndex.add(block)
    }

    // Detect duplicate entries (same approach as SemanticStructureNode for props)
    const seenEntries = new Set<string>()
    for (const entry of this.entries) {
      const entryPath = entry.hasChain
        ? `${entry.id}.${entry.chain.map(c => c.text).join('.')}`
        : entry.id!
      if (seenEntries.has(entryPath)) {
        const idRange = entry.token('identifier')!.range
        const endRange = entry.hasChain
          ? entry.chain[entry.chain.length - 1].range
          : idRange
        doc.messages.push({
          severity: 1,
          message: 'Duplicate annotate entry',
          range: { start: idRange.start, end: endRange.end },
        })
        continue
      }
      seenEntries.add(entryPath)
    }

    // Register child refs into tokensIndex (for chain completions/hover).
    // Entry ref identifiers also go into doc.referred via referredIdentifiers
    // (inherited from SemanticNode) for navigation and find-usages.
    if (this.definition) {
      this.definition.registerAtDocument(doc)
    }
    this.annotations?.forEach(val => {
      doc.registerAnnotation(val)
    })
  }
}
