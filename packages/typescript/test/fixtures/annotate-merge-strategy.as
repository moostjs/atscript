@mulAppend 'top-original'
export interface User {
    @label 'Original Name'
    @mulAppend 'prop-original'
    @mul 1
    @mul 2
    name: string
}

@mulAppend 'top-mutated'
annotate User {
    @label 'Mutated Name'
    @mulAppend 'prop-mutated'
    @mul 99
    name
}

@mulAppend 'top-aliased'
export annotate User as User2 {
    @label 'Aliased Name'
    @mulAppend 'prop-aliased'
    @mul 77
    name
}
