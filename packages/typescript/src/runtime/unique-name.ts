/**
 * `base`, or — when `taken` reports it taken — the first `<base><sep><n>` (n = 1, 2, …) it
 * does not.
 */
export function uniqueName(base: string, taken: (name: string) => boolean, sep: string): string {
  let name = base
  for (let n = 1; taken(name); n++) {
    name = `${base}${sep}${n}`
  }
  return name
}
