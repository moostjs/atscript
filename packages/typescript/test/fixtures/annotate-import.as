import { MyInterface } from './annotate-nonmutating'

export annotate MyInterface as ImportedAnnotated {
    @label 'Imported Name'
    name
    @label 'Imported City'
    address.city
}
