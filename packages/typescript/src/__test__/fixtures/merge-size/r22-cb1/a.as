export type TA = { x?: string }
export type TB = { x?: string }
export interface IC { x?: string }
export type TD = { x?: string }
export interface H { a?: TA; b?: TB; c?: IC; d?: TD }
annotate TD {
  @meta.readonly
  @meta.label 'D'
}
