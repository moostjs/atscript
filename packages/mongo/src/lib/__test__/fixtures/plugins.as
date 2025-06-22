@mongo.collection 'IdPlugin'
export interface IdPlugin {
    _id: mongo.objectId
}

@mongo.collection 'UniqueItems'
export interface UniqueItems {
    str?: string[]

    @mongo.array.uniqueItems
    strUnique?: string[]

    obj?: {
        a: string
        b: string
    }[]

    @mongo.array.uniqueItems
    objUnique?: {
        a: string
        b: string
    }[]

    @mongo.array.uniqueItems
    kObj?: {
        @meta.isKey
        a: string
        b: string
    }[]
}