export interface Issue {
  id: number
  raisedAt: number
}

export interface Queue {
  @some.compute `openCount * 10 + overdueCount`
  rank: number
  @some.compute `-(a - b) * 2 / coalesce(c, 1.5) - -1`
  score: number
  @some.joins Issue, `raisedAt desc, Issue.id`
  oldest: number
}
