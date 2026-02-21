/**
 * Throws a runtime error indicating that a feature is disabled.
 * Used by generated JS files to avoid duplicating the error message string.
 */
export function throwFeatureDisabled(feature: string, option: string, annotation: string): never {
  throw new Error(
    `${feature} support is disabled. To enable, set \`${option}: 'lazy'\` or \`${option}: 'bundle'\` in tsPlugin options, or add @${annotation} annotation to individual interfaces.`
  )
}
