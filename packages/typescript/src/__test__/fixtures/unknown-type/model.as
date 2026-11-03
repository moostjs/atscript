export type Json = unknown

export interface Payload {
  data: unknown
  extra?: unknown
  list: unknown[]
  either: string | unknown
  alias: Json
  narrowed: { v: unknown } & { v: string }
}
