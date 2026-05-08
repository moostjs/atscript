export interface Helper {
    value: string
}

export interface Base {
    state: {
        context: Helper
        items: Helper[]
        union: Helper | string
    }
}
