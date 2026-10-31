export interface Address {
  @meta.label 'addr'
  @expect.maxLength 20
  city: string
  next?: Address
}
export interface User {
  home: Address
  work: Address
}
export interface Admin extends User {
  level?: number
}
export type UM = User & {
  home: {
    @expect.maxLength 8
    city: string
  }
}
annotate User {
  @meta.label 'U-home'
  @expect.maxLength 6
  home.city
}