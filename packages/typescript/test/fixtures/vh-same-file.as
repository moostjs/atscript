export interface VhSameDict {
  @meta.id
  code: string
}

export interface VhSameTicket {
  @test.vh VhSameDict, 'code'
  color: string
}

export interface VhSameView {
  color: VhSameTicket.color
}
