
@label 'IA'
interface IA {
    @label 'a from IA'
    a: string
    @ia
    @label 'b from IA'
    b?: number
}

@label 'IB'
interface IB {
    @ib
    @label 'b from IB'
    b: number
    @label 'c from IB'
    @ib
    c?: string
}

@Tlabel 'T'
type T = IA & IB

export interface I1 {
    all: T,
    a: T.a
    b: T.b
    c: T.c
}
