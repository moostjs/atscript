/**
 * Builds an {@link AnnotationSpec} `description` (shown in IDE hovers) that ends with an
 * example block: `description`, then an **Example:** heading and an `atscript` code fence
 * with one `lines` entry per line (pass `''` for a blank line).
 *
 * @example
 * ```ts
 * new AnnotationSpec({
 *   description: annotationExample(
 *     'Marks a field as **read-only**.',
 *     '@meta.readonly',
 *     'createdAt: string.date'
 *   ),
 * })
 * ```
 */
export function annotationExample(description: string, ...lines: string[]): string {
  return `${description}\n\n**Example:**\n\`\`\`atscript\n${lines.join('\n')}\n\`\`\``
}
