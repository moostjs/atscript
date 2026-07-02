interface Source {
    @label 'Code'
    @structural 'by_code'
    code: number
}

interface Dict {
    code: Source.code
}

export interface OneHop {
    code: Source.code
}

export interface TwoHop {
    @structural 'local_idx'
    code: Dict.code
}

export interface Extended extends Source {
    name: string
}
