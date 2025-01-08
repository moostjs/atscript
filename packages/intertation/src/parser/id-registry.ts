import type { SemanticImportNode } from './nodes/import-node'
import type { Token } from './token'

export class IdRegistry {
  public readonly reserved: Set<string>

  public readonly definitions = new Map<string, Token>()

  private readonly exported = new Map<string, Token>()

  private readonly imported = new Map<string, Token>()

  public readonly duplicates = new Set<Token>()

  public readonly forbidden = new Set<Token>()

  constructor(reserved: string[] = []) {
    this.reserved = new Set(['interface', 'type', 'import', 'from', 'export'].concat(reserved))
  }

  export(token: Token) {
    this.register(token, 'export')
  }

  clear() {
    this.definitions.clear()
    this.exported.clear()
    this.imported.clear()
    this.duplicates.clear()
    this.forbidden.clear()
  }

  register(token?: Token, ie?: 'import' | 'export') {
    if (!token) {
      return
    }
    if (this.reserved.has(token.text)) {
      this.forbidden.add(token)
    } else if (this.definitions.has(token.text)) {
      this.duplicates.add(token)
    } else {
      this.definitions.set(token.text, token)
      if (ie === 'export') {
        this.exported.set(token.text, token)
      } else if (ie === 'import') {
        this.imported.set(token.text, token)
      }
    }
  }

  import(token: Token) {
    this.register(token, 'import')
  }
}
