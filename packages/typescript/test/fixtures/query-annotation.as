export interface User {
  @some.filter `status = 'active'`
  name: string
  @some.filter `age >= 18`
  age: number
}

export interface Order {
  @some.filter `User.status = 'active'`
  userId: number
  @some.filter `status = 'pending' and total > 100`
  total: number
  @some.filter `status = 'active' and (plan = 'premium' or role = 'admin')`
  plan: string
  @some.filter `role in ('admin', 'moderator')`
  role: string
  @some.filter `email exists`
  email: string
  @some.filter `not (deleted = true)`
  deleted: boolean
  @some.filter `role not in ('banned', 'suspended')`
  category: string
  @some.filter `name matches /^admin/i`
  label: string
  @some.joins User, `Order.userId = User.id`
  joinField: string
}
