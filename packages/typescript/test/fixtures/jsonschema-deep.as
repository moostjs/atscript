export interface JsonDeep {
  s: string
  n: number
  c: string | number
  obj: {
    a: string
    b: number
    c: boolean
  }
  a: string[]
  aObj: {
    a: string
    b: number
    c: boolean
  }[]
  optional?: string
  optionalObj?: {
    a: string
    b: number
    c: boolean
  }
  deep: {
    deeper: {
      deepest: string
    }
  }
}