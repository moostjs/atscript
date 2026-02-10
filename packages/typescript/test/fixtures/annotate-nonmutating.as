@meta.description 'Original'
export interface MyInterface {
    @label 'Original Name'
    name: string

    @label 'Original Age'
    age: number

    email: string.email

    address: {
        @label 'Street'
        street: string
        city: string
    }
}

@meta.description 'Annotated'
export annotate MyInterface as AnnotatedInterface {
    @label 'Custom Name'
    name
    @label 'Custom Age'
    age
    @label 'Custom Address City'
    address.city
}
