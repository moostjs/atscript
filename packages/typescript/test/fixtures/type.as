export type TPrimitive = string

export type TPirmiitiveUn = string | number

export type TLiteral = 'value'

export type TNumber = 5

export type TTuple1 = [string]

export type TTuple2 = [string, string]

export type TTupleArray = [string, string][]

export type TArray = string[]

export type TArray2 = string[][]

export type TArray3 = string[][][]

export type TComplexArray = (string | number)[]

export type TComplexArray2 = (string | number)[][]

export type TComplexArray3 = (string | number)[][][]

export type TComplexArray4 = string | number[]

export type TComplexArray5 = string[] | number

export type TObject = {
    prop1: string
    prop2?: number
    nested: {
        prop3: boolean
        prop4?: boolean
    }
}

export type TObjectUnion1 = { a: 'a' } | string

export type TObjectUnion2 = string | { a: 'a' }

export type TObjectIntersection = { a: 'a' } & { b: 'b' }