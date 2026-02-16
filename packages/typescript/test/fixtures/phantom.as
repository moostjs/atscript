export interface MyForm {
    @label "Name"
    name: string

    @label "Info paragraph"
    @component "paragraph"
    info: phantom

    @label "Email"
    email: string.email

    @label "Reset password"
    @component "link"
    resetPassword: phantom

    optional?: string
}
