@label "Playground Form"
export interface PlaygroundForm {
  @label "Addresses /Contacts"
  addresses: (Address | Contact | MyString)[]
}

@label "Address"
interface Address {
  type: 'address'
  street: string
  city: string
}

@label "Contact"
interface Contact {
  type: 'phone'
  email: string
  phone: string
}

@label "My String Label"
type MyString = string
