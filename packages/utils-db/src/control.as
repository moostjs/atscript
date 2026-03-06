@db.table '__atscript_control'
export interface AtscriptControl {
    @meta.id
    key: string

    value?: string

    lockedBy?: string

    lockedAt?: number

    expiresAt?: number
}
