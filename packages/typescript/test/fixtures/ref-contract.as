import { RcCustomer } from './ref-contract-common'

// Same-file targets — every reference to these is an eager refTo.
export interface RcAddress {
    city: string
}

export interface RcLine {
    sku: string
}

export type RcLocalAlias = RcAddress
export type RcChainAlias = RcAddress.city
export type RcCustomerAlias = RcCustomer

export interface RcOrder {
    id: string

    // eager plain / eager chain
    address: RcAddress
    city: RcAddress.city
    lines: RcLine[]

    // lazy plain / lazy chain
    customer: RcCustomer
    customerId: RcCustomer.id
}

export type RcOrderAlias = RcOrder

// Mutating annotate through a ref boundary — codegen $c-clones `line` in place.
export interface RcShipment {
    line: RcLine
    customer: RcCustomer
}

annotate RcShipment {
    @meta.label 'SKU'
    line.sku
    @meta.label 'Customer name'
    customer.name
}
