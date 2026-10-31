// Intersections with union members nested in a merge, too large to inline (`Big`, `Wide`):
// merge states (`T*`), the same types merged in place (`U*`, an interface's prop), and their
// members as types of their own (the specs build runtime intersections of them).

export interface Big {
  p1: string
  p2: string
  p3: string
  p4: string
  p5: string
  p6: string
  p7: string
  p8: string
  p9: string
  p10: string
  p11: string
  p12: string
  p13: string
  p14: string
  p15: string
  p16: string
  p17: string
  p18: string
  p19: string
  p20: string
}

export interface Wide {
  p1?: string
  p2?: string
  p3?: string
  p4?: string
  p5?: string
  p6?: string
  p7?: string
  p8?: string
  p9?: string
  p10?: string
  p11?: string
  p12?: string
  p13?: string
  p14?: string
  p15?: string
  p16?: string
  p17?: string
}

export interface Opt {
  a?: string
}

export type T = { w: string } & { f: Big & ({ g?: boolean } | number) }

export interface U {
  f: Big & ({ g?: boolean } | number)
}

// A union member's branches declare the props a sibling declares (`e`, `d`), with unions.
export type T59 = { w: string } & {
  f: Wide & ({ e: string } | { e: Opt, d: Opt | number }) & { e: Opt, d: { b?: string } | string }
}

export interface U59 {
  f: Wide & ({ e: string } | { e: Opt, d: Opt | number }) & { e: Opt, d: { b?: string } | string }
}

// Union members whose branches are an intersection or an array.
export type T250 = { w: string } & {
  f: { e?: Opt } & ((Wide & { g: string }) | Opt[]) & ({ g: string } | { h?: number })
}

export interface U250 {
  f: { e?: Opt } & ((Wide & { g: string }) | Opt[]) & ({ g: string } | { h?: number })
}

// A prop several members declare, one with a union type (no union member).
export type TShared = { w: string } & { f: Wide & { d: Opt } & { d?: { b?: string } | { c?: number } } }

export interface UShared {
  f: Wide & { d: Opt } & { d?: { b?: string } | { c?: number } }
}

// The members written in place above, as types (see `runtimeOf` in the spec).
export type GN = { g?: boolean } | number
export type E59a = { e: string } | { e: Opt, d: Opt | number }
export type E59b = { e: Opt, d: { b?: string } | string }
export type E250a = { e?: Opt }
export type E250b = (Wide & { g: string }) | Opt[]
export type E250c = { g: string } | { h?: number }
