export {}

declare global {
  interface AnscriptMetadata {
    [name: string]: string[]
  }
  type AnscriptPrimitiveFlags = string
}
