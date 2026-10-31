export interface Address {
  @expect.maxLength 10
  street: string
  zip?: number
}
