import { describeCopies } from './annotate-recursive-copies.shared'

// Path annotates of recursive types and the types built from them (see the shared file): with
// compiled validators. The interpreted run is `annotate-recursive-copies.spec.ts` (another worker).
describeCopies([true])
