import { Base } from './extends-synth-clash-base'

export interface Helper {
    fromChild: number
}

export interface Child extends Base {
    own: Helper
}
