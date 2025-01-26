import { RiskStructure, RiskType } from './file-2'

@label 'label'
@mongo.collection 'someCollection'
@mongo.index 'indexName'
export interface SomeStructure {
    @label 'label'
    firstName: string

    @label 'Last Name', 
    lastName: string

    @label 'Age'
    age: number
    
    from: 123

    export: number

    @mongo.test 'test'
    @label 'Contacts'
    contacts: Contacts[]

    email: Contacts.email

    nested: {
        prop1: {
            prop2: string
        }
    }

    @label 'label'
    riskProfile: RiskType
}

export type SomeType = SomeStructure

@dummy 'test'
interface Contacts {
    @label 'Email'
    email: string
    
    @label 'Phone Number'
    phone: string
}

@mongo.collection 'true'
@label 'label'
type test = Contacts
