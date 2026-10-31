import { describeCopies } from './annotate-recursive-copies.shared'

// Path annotates of recursive types and the types built from them (see the shared file): interpreted.
// The compiled run is `annotate-recursive-copies-compiled.spec.ts` (another worker).
describeCopies([false])
