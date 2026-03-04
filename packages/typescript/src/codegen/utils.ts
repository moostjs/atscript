const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

/**
 * Wraps a property name in double quotes if it's not a valid identifier (contains special chars, etc.).
 *
 * Examples:
 *  - "validName" => "validName"
 *  - "some-prop" => "\"some-prop\""
 */
export function wrapProp(name: string): string {
  if (!validIdentifier.test(name)) {
    return `"${escapeQuotes(name)}"`
  }
  return name
}

export function escapeQuotes(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
