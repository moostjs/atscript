import { Base1 } from './extends-synth-multi-base1'
import { Base2 } from './extends-synth-multi-base2'

export interface Child extends Base1, Base2 {
    id: string
}
