import { AnnotateExtendsBase } from './annotate-extends-base'

export interface AnnotateExtendsChild extends AnnotateExtendsBase {
    extra: string
}

annotate AnnotateExtendsBase {
    @meta.id
    username
}
