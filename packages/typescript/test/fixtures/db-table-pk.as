@db.table 'single_pk'
export interface SinglePk {
    @meta.id
    id: string
    name: string
}

@db.table 'compound_pk'
export interface CompoundPk {
    @meta.id
    userId: string
    @meta.id
    orderId: number
    amount: number
}

@db.table 'no_pk'
export interface NoPk {
    name: string
    value: number
}

@db.table 'mongo_single_pk'
@db.mongo.collection
export interface MongoSinglePk {
    @meta.id
    id: number
    name: string
    _id: string
}

@db.table 'mongo_compound_pk'
@db.mongo.collection
export interface MongoCompoundPk {
    @meta.id
    userId: string
    @meta.id
    orderId: number
    amount: number
    _id: string
}

@db.table 'mongo_no_pk'
@db.mongo.collection
export interface MongoNoPk {
    name: string
    value: number
    _id: string
}

@db.table 'mongo_id_as_meta_id'
@db.mongo.collection
export interface MongoIdAsMetaId {
    @meta.id
    _id: string
    name: string
}
