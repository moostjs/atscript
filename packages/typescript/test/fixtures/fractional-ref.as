@meta.label 'Roles'
@meta.description '/api/db/tables/roles'
export interface FractionalRolesTable {
    id: string
    name: string
}

export interface FractionalBarrenTable {
    id: string
}

@meta.label 'T2'
export interface FractionalTarget2 {
    id: string
}

@meta.label 'T1'
export interface FractionalTarget1 {
    id: string
    fieldB: FractionalTarget2.id
}

@meta.label 'Target'
export interface FractionalBaselineTarget {
    id: string
    name: string
}

@meta.label 'Full'
export interface FractionalFullTarget {
    id: string
    name: string
}

@meta.label 'Shallow'
@meta.description '/api/db/tables/shallow'
export interface FractionalShallowTarget {
    id: string
}

export interface FractionalSourceRoles {
    roleId: FractionalRolesTable.id
}

export interface FractionalSourceBarren {
    barrenId: FractionalBarrenTable.id
}

export interface FractionalSourceNested {
    fieldA: FractionalTarget1.id
}

export interface FractionalSourceBaseline {
    fk: FractionalBaselineTarget.id
}

export interface FractionalSourceFull {
    fk: FractionalFullTarget.id
}

export interface FractionalSourceShallow {
    fk: FractionalShallowTarget.id
}
