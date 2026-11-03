export type Login = string.email

export interface Address {
  @meta.label 'City'
  @expect.minLength 2
  city: string
}

@meta.label 'Account'
@meta.description 'An account'
export interface Account {
  @meta.label 'Name'
  @expect.pattern '^[A-Z]'
  name: string

  login: Login

  email: string.email

  @meta.sensitive
  token: string

  @expect.pattern '^a'
  @expect.pattern 'z$'
  code: string

  address: Address
  billing: Address
}

annotate Account {
  // (a declared append value dropped; the block's own applies over the reset)
  @annotate.reset 'expect.pattern'
  @expect.pattern '^n'
  name

  // (inherited from the referenced type)
  @annotate.reset 'expect.pattern'
  login

  // (a referrer's own path: Address.city keeps its constraint)
  @annotate.reset 'expect.minLength'
  @annotate.reset 'meta.label'
  billing.city
}

// (blocks in source order: a later reset drops an earlier block's value…)
annotate Account {
  @expect.pattern '^c'
  code
}
annotate Account {
  @annotate.reset 'expect.pattern'
  code
}

// (…and a later block's value applies over an earlier reset)
annotate Account {
  @annotate.reset 'meta.label'
  name
}
annotate Account {
  @meta.label 'Full name'
  name
}

@annotate.reset 'meta.description'
@meta.label 'Public account'
export annotate Account as PublicAccount {
  @annotate.reset 'meta.sensitive'
  token

  @annotate.reset 'expect.pattern'
  email
}

export interface Holder {
  account: Account
  login: Account.login
}

@meta.label 'Tag'
@meta.description 'A tag'
export interface Tag {
  name: string
}

@annotate.reset 'meta.label'
annotate Tag {}

export interface Ranked {
  @meta.label 'L'
  @expect.pattern '^p'
  a: string
}

// (fields with bases: rank order on a reference node)
export interface RankedRef {
  l1: Login
  l2: Login
}
