export interface MyInterface {
    @label 'Original Name'
    name: string

    age: number

    email: string.email

    address: {
        street: string
        city: string
    }
}

@meta.description 'Mutated Interface'
annotate MyInterface {
    @label 'Mutated Name'
    @mul 42
    name
    @label 'Mutated Age'
    age
    @label 'Mutated City'
    address.city
}
