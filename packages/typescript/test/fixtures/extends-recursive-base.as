export type JsonValue = string | number | boolean | null | JsonValue[] | { [/^.+$/]: JsonValue }

export interface Base {
    state: {
        context: JsonValue
        meta?: { [/^.+$/]: JsonValue }
    }
}
