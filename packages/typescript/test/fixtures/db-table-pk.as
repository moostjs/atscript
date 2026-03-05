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

@db.table 'pk_with_unique'
export interface PkWithUnique {
    @meta.id
    id: number
    @db.index.unique 'email_idx'
    email: string
    name: string
}

@db.table 'unique_only'
export interface UniqueOnly {
    name: string
    @db.index.unique 'code_idx'
    code: string
    @db.index.unique 'num_idx'
    num: number
}

@db.table 'compound_unique'
export interface CompoundUnique {
    @meta.id
    id: number
    @db.index.unique 'tenant_email'
    tenantId: string
    @db.index.unique 'tenant_email'
    email: string
    @db.index.unique 'slug_idx'
    slug: string
}
