import { Address, Category, Country, Status, Tags, Lone, Owner } from './shared'

export interface OrderLine {
  @expect.minLength 3
  sku: string

  @expect.int
  @expect.min 1
  qty: number

  @expect.exclusiveMin 0
  price: number
}

export interface TreeNode {
  @expect.minLength 1
  label: string
  children?: TreeNode[]
}

export type Json = string | number | boolean | null | Json[]

export type Alias1 = Address
export type Alias2 = Alias1

// A chained reference into an imported type: only known at runtime (not compiled)
export type ChainAlias = Address.street

export type LocalAlias = OrderLine
export type LocalAliasOfAlias = LocalAlias


export interface Order {
  @expect.pattern "^ORD-\d+$"
  @expect.pattern "^ORD-1"
  id: string

  @meta.required
  @expect.maxLength 50
  name: string

  @meta.required
  note?: string

  @meta.required
  nickname?: string | null

  status: Status

  address: Address

  billing?: Address

  aliased?: Alias2

  country: Country

  tags: Tags

  @expect.minLength 1
  @expect.maxLength 20
  lines: OrderLine[]

  local?: LocalAliasOfAlias

  pair?: [number, string]

  both?: Lone & { extra: string }

  @expect.min 0
  @expect.max 10
  score?: number | null

  @expect.maxLength 3
  codes?: string | string[]

  info: phantom

  category?: Category

  tree?: TreeNode

  json?: Json

  price?: decimal

  meta?: {
    [*]: string
  }

  flags?: {
    active: boolean
    @meta.required
    accepted?: boolean
  }

  kind?: "a" | "b" | 1

  owner?: Owner

  @expect.pattern "^x", "g"
  stateful?: string

  inter?: string & Country

  @expect.maxLength 2
  statuses?: Status[]
}

annotate Order {
  @expect.maxLength 10
  address.street
}
