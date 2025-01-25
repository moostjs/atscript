import { SomeStructure, SomeType } from './file-1'

export type RiskType = 'low' | 'medium' | 'high' | 0 | 1 | 2

@label 'label'
export interface RiskStructure {
    props: string
    risk: RiskType
    
    @label 'label'
    email: SomeStructure.email
    risk2?: RiskStructure
}

type LocalType = string