@mongo.collection 'arrays'
export interface ArraysCollection {
    primitive: string[]

    primitiveComplex: (number | string)[]
    
    withKey: {
        @meta.isKey
        key1: string
        @meta.isKey
        key2: string
        value: string
        attribute: string
    }[]

    @mongo.patch.strategy 'merge'
    withKeyMerge: {
        @meta.isKey
        key1: string
        @meta.isKey
        key2: string
        value: string
        attribute: string
    }[]
    
    withoutKey: {
        key: string
        value: string
        attribute?: string
    }[]

    @mongo.patch.strategy 'merge'
    withoutKeyMerge: {
        key: string
        value: string
        attribute: string
    }[]
}