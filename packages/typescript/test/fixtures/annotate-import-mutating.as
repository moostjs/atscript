import { MyInterface } from './annotate-nonmutating'

@meta.description 'Cross-File Mutated'
annotate MyInterface {
    @label 'Cross-File Name'
    name
    @label 'Cross-File City'
    address.city
}
