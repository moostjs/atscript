import type { Token } from './token'
import type { TMessages } from './types'

export class IdRegistry {
  public readonly reserved: Set<string>

  public readonly globalTypes: Set<string>

  public readonly definitions = new Map<string, Token>()

  public readonly duplicates = new Set<Token>()

  public readonly forbidden = new Set<Token>()

  constructor(globalTypes: string[] = []) {
    this.reserved = new Set(
      ['interface', 'type', 'import', 'from', 'export', 'annotate', 'as'].concat(globalTypes)
    )
    this.globalTypes = new Set(globalTypes)
  }

  clear() {
    this.definitions.clear()
    this.duplicates.clear()
    this.forbidden.clear()
  }

  registerDefinition(token?: Token) {
    if (!token) {
      return
    }
    if (this.reserved.has(token.text)) {
      this.forbidden.add(token)
    } else if (this.definitions.has(token.text)) {
      this.duplicates.add(token)
    } else {
      this.definitions.set(token.text, token)
    }
  }

  isDefined(t: string | Token) {
    const text = typeof t === 'string' ? t : t.text
    return this.definitions.has(text) || this.globalTypes.has(text)
  }

  getErrors(): TMessages {
    return [
      ...Array.from(this.duplicates, t => ({
        severity: 1,
        message: `Duplicate identifier "${t.text}"`,
        range: t.range,
      })),
      ...Array.from(this.forbidden, t => ({
        severity: 1,
        message: `Reserved keyword "${t.text}"`,
        range: t.range,
      })),
    ] as TMessages
  }
}
