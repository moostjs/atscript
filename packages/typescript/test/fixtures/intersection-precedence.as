export interface PA {
  a: string
}

export interface PB {
  b: number
}

// Unions in an intersection keep their parentheses (`&` binds tighter than `|`).
export interface Precedence {
  nullable: (PA | null) & (PB | null)
  withString: (PA | string) & (PB | string)
  arrays: (PA[] | null) & (PB[] | null)
  branches: (PA | PB) & { c?: boolean }
  inUnion: PA & PB | string
  inArray: (PA & PB)[]
  tuples: [PA, string] & [PB, string]
}

// (`SelfInter = PA & SelfInter`, `MutualX = PA & MutualY`, `MutualY = PB & MutualX` were here:
// a type that is an operand of its own merge is a compile error now, MODEL §10 D4.)
