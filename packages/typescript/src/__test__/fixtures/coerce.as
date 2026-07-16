@expect.int
@expect.min 0
export type KafkaOffset = number

export type Flag = boolean

export type Level = 1 | 2 | 'max'

export type MaybeNumber = string | number

export interface SearchQuery {
    @expect.min 0
    offset: number

    @expect.min 1
    @expect.max 100
    limit?: number

    active: boolean

    term: string

    price: decimal

    ids: number[]

    nested?: {
        depth: number
    }
}
