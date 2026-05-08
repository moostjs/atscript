import { Base } from './extends-fallback-base'

export interface Helper {
    fromChild: number
}

export interface Helper_1 {
    alsoFromChild: boolean
}

export interface Child extends Base {
    a: Helper
    b: Helper_1
}
