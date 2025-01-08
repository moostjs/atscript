/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function debounce<A>(fn: (a: A) => any, delay: number) {
  let timer: NodeJS.Timeout
  return (a: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      fn(a)
    }, delay)
  }
}
