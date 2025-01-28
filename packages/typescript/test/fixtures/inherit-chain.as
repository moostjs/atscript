@fromTType
@from 'TType'
@pass1 'TType'
@pass2 'TType'
@pass3 'TType'
type TType = string

interface I1 {
    @fromI1
    @from 'I1'
    @pass2 'I1'
    prop?: TType
}

export interface I2 {
    @fromI2
    @from 'I2'
    @pass3 'I2'
    prop?: I1.prop
}
