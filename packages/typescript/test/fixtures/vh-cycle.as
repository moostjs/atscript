@test.vh VhCycleB, 'id'
export interface VhCycleA {
  @meta.id
  id: string
}

@test.vh VhCycleA, 'id'
export interface VhCycleB {
  @meta.id
  id: string
}

export interface VhCycleHost {
  @test.vh VhCycleA, 'id'
  a: string
}
