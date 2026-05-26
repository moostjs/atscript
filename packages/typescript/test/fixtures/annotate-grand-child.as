import { AnnotateGrandMid } from './annotate-grand-mid'
import { AnnotateGrandGrandparent } from './annotate-grand-grandparent'

export interface AnnotateGrandChild extends AnnotateGrandMid {
    extra: string
}

annotate AnnotateGrandGrandparent {
    @meta.id
    username
}
