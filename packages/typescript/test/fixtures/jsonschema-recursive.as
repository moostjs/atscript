export interface TreeNode {
  label: string
  children?: TreeNode[]
}

export interface Holder {
  t?: TreeNode
  peers?: Holder[]
}

export type Forest = TreeNode[]

export type Point = { x: number }

export interface Shape {
  a: Point
  b?: Point
  t?: TreeNode
}

export type AliasOfPoint = Point

export interface Pair {
  id: [Point, AliasOfPoint]
}
