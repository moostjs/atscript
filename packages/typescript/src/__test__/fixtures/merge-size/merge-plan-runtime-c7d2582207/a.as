export interface Address {
  @expect.maxLength 20
  city: string
}
export interface User {
  home: Address
  list: Address[]
  deep: { a: Address }
  opt?: Address
}
export type UArr = User & {
  list: {
    @expect.maxLength 8
    city: string
  }[]
}
export type UDeep = User & {
  deep: {
    a: {
      @expect.maxLength 8
      city: string
    }
  }
}
export type UOpt = User & {
  opt?: {
    @expect.maxLength 8
    city: string
  }
}
export type URev = {
  home: {
    @expect.maxLength 8
    city: string
  }
} & User
export interface Holder extends User {
  x?: string
}
export type HM = Holder & {
  home: {
    @expect.maxLength 8
    city: string
  }
}