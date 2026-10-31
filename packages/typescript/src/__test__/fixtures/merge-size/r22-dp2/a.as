export interface A0 {
  next?: A1
  y?: string
}
export interface A1 {
  next?: A2
  y?: string
}
export interface A2 {
  next?: A3
  y?: string
}
export interface A3 {
  next?: A4
  y?: string
}
export interface A4 {
  next?: A5
  y?: string
}
export interface A5 {
  next?: A6
  y?: string
}
export interface A6 {
  next?: A0
  y?: string
}
export interface B0 {
  next?: B1
  y?: string
}
export interface B1 {
  next?: B2
  y?: string
}
export interface B2 {
  next?: B3
  y?: string
}
export interface B3 {
  next?: B4
  y?: string
}
export interface B4 {
  next?: B5
  y?: string
}
export interface B5 {
  next?: B6
  y?: string
}
export interface B6 {
  next?: B7
  y?: string
}
export interface B7 {
  next?: B8
  y?: string
}
export interface B8 {
  next?: B9
  y?: string
}
export interface B9 {
  next?: B10
  y?: string
}
export interface B10 {
  next?: B0
  y?: string
}
export type M = A0 & B0
