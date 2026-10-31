export interface Tuples {
  inline: [{ n: string }]
  nested: [[string, number]]
  union: [string | number]
  pair: [string | number, boolean]
  grouped: ({ n: string })
}
