import { AnnotationSpec, annotationExample, forEachAnnotationSpec } from '../annotations'
import type { TValueCandidate } from '../annotations'
import type { TAnnotationsTree } from '../config'
import { isAnnotate, isRef } from '../parser/nodes'
import { TSeverity, type TMessages } from '../parser/types'

/** Whether `name` is in the `annotate` namespace: a directive of `annotate` blocks, never metadata. */
export function isAnnotateDirective(name: string): boolean {
  return name.startsWith('annotate.')
}

/** The annotations of the `annotate` namespace: directives of `annotate` blocks, not metadata. */
export const annotateAnnotations: TAnnotationsTree = {
  reset: new AnnotationSpec({
    description: annotationExample(
      'Removes an annotation the annotated field or type would otherwise carry — declared on ' +
        'it, inherited from the type it references (`email: Email`, a primitive like ' +
        '`string.email`), from the target of an `annotate … as` copy, or written by a ' +
        'lower-ranked `annotate` block. Allowed only in `annotate` blocks (mutating and ' +
        '`annotate … as`), on an entry or at the top of the block (the type itself). The ' +
        "block's own value of that annotation applies over the reset; any other value does not. " +
        'Repeat it to reset several annotations.',
      'annotate User as PublicUser {',
      "    @annotate.reset 'expect.pattern'",
      "    @expect.pattern '^[a-z]+$'",
      '    login',
      '',
      "    @annotate.reset 'meta.sensitive'",
      '    token',
      '}'
    ),
    multiple: true,
    argument: {
      name: 'annotation',
      type: 'string',
      description:
        'The full name of the annotation to remove, without `@` (`expect.pattern`, `meta.label`).',
      valueScope: (_token, doc) => annotationNames(doc.config.annotations),
    },
    validate(token, args, doc) {
      const messages: TMessages = []
      const parent = token.parentNode
      const id = parent && isRef(parent) ? parent.token('identifier') : undefined
      const inBlock =
        (!!parent && isAnnotate(parent)) ||
        (!!id && !!doc.annotateBlockAt(id.range.start.line, id.range.start.character))
      if (!inBlock) {
        messages.push({
          severity: TSeverity.Error,
          message: '@annotate.reset is allowed only in annotate blocks',
          range: token.range,
        })
      }
      const name = args[0]?.type === 'text' ? args[0].text : undefined
      if (name === undefined) {
        return messages
      }
      if (isAnnotateDirective(name) || name === 'annotate') {
        messages.push({
          severity: TSeverity.Error,
          message: `"${name}" is not metadata: it cannot be reset`,
          range: args[0].range,
        })
      } else if (!doc.resolveAnnotation(name)) {
        const unknown = doc.config.unknownAnnotation
        if (unknown !== 'allow') {
          messages.push({
            severity: unknown === 'warn' ? TSeverity.Warning : TSeverity.Error,
            message: `Unknown annotation "@${name}"`,
            range: args[0].range,
          })
        }
      }
      return messages
    },
  }),
}

/** The full names of the metadata annotations of `tree` (completion of `@annotate.reset`). */
function annotationNames(tree: TAnnotationsTree | undefined): TValueCandidate[] {
  const out: TValueCandidate[] = []
  forEachAnnotationSpec(tree ?? {}, (name, spec) => {
    if (!isAnnotateDirective(name)) {
      const doc = spec.config.description
      out.push({ value: name, documentation: doc })
    }
  })
  return out
}
