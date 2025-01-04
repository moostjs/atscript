export interface TNodeData {
  node:
    | 'annotation'
    | 'comment'
    | 'punctuation'
    | 'identifier'
    | 'text'
    | 'number'
    | 'block'
    | 'unknown'
  text: string
  array?: '[]'
  children?: TNodeData[]
  startOffset?: number
  endOffset?: number
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
