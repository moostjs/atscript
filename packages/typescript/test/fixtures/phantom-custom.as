export interface MyForm {
    @label "Name"
    name: string

    @label "Info paragraph"
    @component "paragraph"
    info: ui.paragraph

    @label "Email"
    email: string.email

    @label "Reset password"
    @component "link"
    resetPassword: ui.action

    optional?: string
}
