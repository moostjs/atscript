/**
 * Wraps a property name in double quotes if it's not a valid identifier (contains special chars, etc.).
 *
 * Examples:
 *  - "validName" => "validName"
 *  - "some-prop" => "\"some-prop\""
 */
export function wrapProp(name: string): string {
  // Basic regex for a valid JS/TS identifier: starts with a letter/$/_,
  // followed by any letters/numbers/$/_.
  // This doesn't check reserved keywords, but it handles most typical cases.
  const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

  if (!validIdentifier.test(name)) {
    // If it fails the check (e.g., has a dash or space),
    // wrap with double quotes. We can also use JSON.stringify if you want
    // to escape special chars automatically, e.g.:
    // return JSON.stringify(name);
    return `"${escapeQuotes(name)}"`
  }
  return name
}

export function escapeQuotes(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
