import { Base } from './intersect-b'

export interface Merged {
  merged: Base & { extra?: string }
}

export annotate Base as BaseView {
  meta
}
