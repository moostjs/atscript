type NullableCount = number | null
type Code = string
type Email = string.email

export interface NullableConstraints {
  @expect.min 0
  @expect.max 10
  score: number | null

  @expect.int
  @expect.min 1, "Count must be at least 1"
  count: NullableCount

  @expect.min 0
  level: number.int | null

  @expect.minLength 2
  @expect.maxLength 5
  @expect.pattern "^[a-z]+$"
  code: Code | null

  @meta.required
  title: string | null

  @expect.maxLength 2
  @expect.array.uniqueItems
  tags: string[] | null

  @expect.max 100
  opt?: number | null

  nested: {
    @expect.max 3
    n?: number | null
  }

  items: {
    @expect.maxLength 3
    label: string | null
  }[]
}

export interface InlinePrimitives {
  contact: string.email | null
  emails: string.email[]
  ints: number.int[]
  pair: [number.int, string.email]
  aliased: Email | null
  aliasedList: Email[]
}

export interface RequiredOptional {
  @meta.required
  name?: string

  @meta.required "Accept the terms"
  agreed?: boolean

  @meta.required
  nullableName?: string | null

  plain?: string

  child?: {
    @meta.required
    note?: string
  }
}

type RequiredName = string.required

export interface RequiredPrimitives {
  name: string.required
  agreed: boolean.required
  aliased: RequiredName
  optionalName?: string.required
}

interface KeyedItem {
  @expect.array.key
  id: string
  v: number
}

type KeyedItems = KeyedItem[] | null

export interface KeyedNullable {
  @expect.array.uniqueItems
  direct: KeyedItem[] | null

  @expect.array.uniqueItems
  nested?: KeyedItems | undefined
}
