@db.table 'arrays'
@db.mongo.collection
export interface ArraysCollection {
    primitive: string[]

    primitiveComplex: (number | string)[]

    withKey: {
        @expect.array.key
        key1: string
        @expect.array.key
        key2: string
        value: string
        attribute: string
    }[]

    @db.mongo.patch.strategy 'merge'
    withKeyMerge: {
        @expect.array.key
        key1: string
        @expect.array.key
        key2: string
        value: string
        attribute: string
    }[]

    withoutKey: {
        key: string
        value: string
        attribute?: string
    }[]

    @db.mongo.patch.strategy 'merge'
    withoutKeyMerge: {
        key: string
        value: string
        attribute: string
    }[]
}