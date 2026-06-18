import { EntityStatus, Profile } from './union-alias-common'

// Cross-file alias of a string-literal union -> lazy refTo (the originally reported bug:
// the alias used to resolve to an empty type = {} / kind "", losing the union).
export type DealerStatus = EntityStatus

// Cross-file alias of an interface/object -> lazy refTo. Must keep its own id (DealerStatus
// vs ProfileAlias vs Profile) and must NOT share the target's type by reference.
export type ProfileAlias = Profile

// Same-file union + same-file alias -> eager refTo (the eager branch must patch in place too).
export type LocalStatus = 'LO' | 'HI'
export type LocalAlias = LocalStatus

@meta.label 'Dealer'
export interface Dealer {
    @meta.label 'Status'
    status: DealerStatus

    priority: LocalAlias

    // Inline union on the same interface — the parity baseline that always worked.
    inlineStatus: 'X' | 'Y'
}
