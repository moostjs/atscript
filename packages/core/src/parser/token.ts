import type { TLexicalToken } from '../tokenizer/types'
import type { SemanticNode } from './nodes'

export class Token {
  constructor(protected readonly _data: TLexicalToken) {}

  toString() {
    const children = this.hasChildren ? ` (${this.children.length})` : ''
    return `[${this.type}] "${this.text}"${children}`
  }

  clone(replace: Partial<TLexicalToken>) {
    const t = { ...this._data, ...replace }
    return new Token(t)
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
    return (this._data.children?.length ?? 0) > 0
  }

  /**
   * This is truth if the text token was ended with a newline character
   */
  get multiline() {
    return this._data.multiline
  }

  /**
   * Set this to file path (e.g. "./src/file.as") for path token in import statement
   */
  public fromPath?: string

  /**
   * All definitions that exported must be marked with this flag
   */
  public exported?: boolean

  /**
   * All the definitions must be marked with this flag
   */
  public isDefinition?: boolean

  /**
   * All the references must be marked with this flag
   */
  public isReference?: boolean

  /**
   * All the import tokens must be marked with this flag
   */
  public imported?: boolean

  /**
   * Refs chained via . or ["propName"] are marked with this flag
   */
  public isChain?: boolean

  /**
   * Prop patterns ([*] or [regexp]) are storing patterns here
   */
  public pattern?: RegExp

  public parentNode?: SemanticNode

  get isAnnotation(): boolean {
    return this._data.type === 'annotation'
  }

  /**
   * Only for annotation arguments: reference to their annotation token
   */
  annotationRef?: Token

  public index?: number

  /**
   * Block type
   */
  public blockType?: 'structure' | 'type' | 'import' | 'annotate'
}
