@id 'interface-with-metadata'
@long.nested.name 'WithMetadata'
@bool.flag
export interface WithMetadata {
    @label 'Prop1'
    prop1: string

    @mul 1
    @mul 2
    @mul 3
    @long.nested.name 'Prop-2'
    @long.nested.name2 'Prop-2-2'
    'prop-2': int

    @nested
    obj: {
        @label 'Prop3'
        prop3: string

        @label 'Prop4'
        prop4: string

        @obj 'str', 123, false
        nested2: {
            nested3: {
                a: float
                b: string
                d: true
                e: null
                f: undefined
            }
        }
    }
}

@id 'Some type'
export type SomeType = {
    @label 'Prop1'
    a: 'b'
}