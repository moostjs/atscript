import { Order } from './models'

@expect.pattern "^[A-Z]{2}$"
export type Country = string

export type Status = 'active' | 'blocked'

export interface Address {
  @expect.maxLength 100
  street: string

  @meta.required
  city: string

  country: Country

  zip?: string
}

export interface Category {
  @expect.minLength 1
  name: string
  parent?: Category
}

@expect.minLength 1
export type Tags = string[]

export interface Lone {
  n: number
}

export interface Owner {
  @meta.required
  name: string
  orders?: Order[]
}
