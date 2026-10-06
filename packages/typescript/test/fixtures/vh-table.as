import { VhDict } from './vh-dict'

export interface VhTicket {
  @meta.id
  id: number

  @test.vh VhDict, 'code', `code = 'x'`
  color: string

  @test.vhq `VhDict.code = 'y'`
  size: string
}
