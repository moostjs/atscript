interface Dog {
    petType: 'dog'
    color: string
    name: string
    isHunt: boolean
}

interface Cat {
    petType: 'cat'
    color: string
    name: string
}

@emit.jsonSchema
export type DogCat = Dog | Cat
