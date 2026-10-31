export interface Address {
  @expect.maxLength 20
  city: string
}
export interface User {
  home: Address
}
export interface HO {
  home: {
    @expect.maxLength 8
    city: string
  }
}
export type UM = User & {
  home: {
    @expect.maxLength 8
    city: string
  }
}
export type UN = User & HO
export interface H {
  m: User & {
    home: {
      @expect.maxLength 8
      city: string
    }
  }
}