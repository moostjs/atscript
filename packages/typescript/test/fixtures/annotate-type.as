
export type TString = string | number

@meta.label 'Labeled String'
annotate TString {}

@meta.label 'Labeled String 2'
export annotate TString as TString2 {}

type TO = {
    name: string
    age: number
} | {
    kind: 'abc' | 'def'
}

@meta.description 'Mutated Descr'
annotate TO {
    @meta.description 'Mutated Descr Age'
    age

    @meta.description 'Mutated Descr Kind'
    kind
}

export annotate TO as TO2 {
    @meta.label 'Age'
    age

    @meta.label 'Kind'
    kind
}
