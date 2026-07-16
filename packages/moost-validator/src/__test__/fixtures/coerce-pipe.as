@expect.int
@expect.min 0
export type KafkaOffset = number

export interface SearchQuery {
    @expect.min 0
    offset: number

    active: boolean

    term: string
}
