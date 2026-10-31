export interface Tree {
  name: string
  children?: Tree[]
  peer?: Other
}

export interface Other {
  t?: Tree
  v: string
}

export annotate Tree as T2 {
  @meta.label 'ptpv'
  peer.t.peer.v
  @expect.maxLength 3
  peer.t.peer.t.name
}
