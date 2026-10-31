import { Tree } from './deep-annotate'

export annotate Tree as T3 {
  @meta.label 'ptpv'
  peer.t.peer.v
  @expect.maxLength 3
  peer.t.peer.t.name
}
