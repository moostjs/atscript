export interface PostTag {
  postId: number
  tagId: number
}

export interface User {
  @some.ref PostTag
  name: string
  @some.ref User.name
  email: string
}
