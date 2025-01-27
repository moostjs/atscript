import { User } from './multiple-interface'
import { TPrimitive, TLiteral, TNumber } from './type'
import { PublicInterface } from './interface'

export interface People {
    groupName: TPrimitive
    size: TNumber
    users: User[]
}