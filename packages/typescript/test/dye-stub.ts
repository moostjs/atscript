// `__DYE_*` are compile-time defines the dye bundler plugin injects at build time.
// Specs run the sources, so every key the sources read gets an empty stub —
// registered as a vitest `setupFiles` entry in the root vitest.config.ts.
for (const key of [
  '__DYE_BLUE__',
  '__DYE_BOLD__',
  '__DYE_BOLD_OFF__',
  '__DYE_COLOR_OFF__',
  '__DYE_CYAN__',
  '__DYE_DIM__',
  '__DYE_DIM_OFF__',
  '__DYE_GREEN__',
  '__DYE_RED__',
  '__DYE_RESET__',
  '__DYE_UNDERSCORE__',
  '__DYE_UNDERSCORE_OFF__',
  '__DYE_YELLOW__',
]) {
  ;(globalThis as Record<string, unknown>)[key] ??= ''
}

export {}
