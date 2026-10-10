export type Stamp = stamp.auto

export type StampOrNull = stamp.auto | null

export type Stamp2 = Stamp

@structural 'alias'
export type StampRelabeled = Stamp

export type StampRelabeled2 = StampRelabeled

interface Source {
    @label 'At'
    at: stamp.auto
}

export type SourceAt = Source.at

export interface Uses {
    direct: stamp.auto
    optional?: stamp.auto
    aliased: Stamp
    aliasedTwice: Stamp2
    relabeled: StampRelabeled
    relabeled2: StampRelabeled2
    member: stamp.auto | null
    viaProp: Source.at
    viaPropAlias: SourceAt
    @structural 'own'
    overridden: stamp.auto
    name: string.required
    agreed: boolean.required
}
