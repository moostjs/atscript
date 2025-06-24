export interface TLexicalToken {
  type:
    | 'annotation'
    | 'comment'
    | 'punctuation'
    | 'identifier'
    | 'text'
    | 'number'
    | 'block'
    | 'unknown'
    | 'regexp'
  text: string
  children?: TLexicalToken[]
  startOffset?: number
  endOffset?: number
  accepted?: boolean
  multiline?: boolean
  getRange: () => {
    start: {
      line: number
      character: number
    }
    end: {
      line: number
      character: number
    }
  }
}
