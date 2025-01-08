import type { TLexicalToken } from '../tokenizer/types'

export class Token {
  constructor(protected readonly _data: TLexicalToken) {}

  toString() {
    const children = this.hasChildren ? ` (${this.children.length})` : ''
    return `[${this.type}] "${this.text}"${children}`
  }

  get text() {
    return this._data.text || '' // equals "text" for identifiers and operator for "punctuation"
  }

  get type() {
    return this._data.type // equals "punctuation" for operators like &, |, ...
  }

  get range() {
    return this._data.getRange()
  }

  get children() {
    return this._data.children || []
  }

  get hasChildren() {
    return Boolean(this._data.children?.length)
  }

  /**
   * This is truth if the text token was ended with a newline character
   */
  get multiline() {
    return this._data.multiline
  }

  /**
   * Set this to file path (e.g. "./src/file.itn") for path token in import statement
   */
  public navigatesToFile?: string
}
