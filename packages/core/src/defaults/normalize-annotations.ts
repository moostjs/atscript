import { AnnotationSpec, annotationExample } from '../annotations'
import type { TAnnotationsTree } from '../config'
import { TSeverity } from '../parser/types'

const NOTE =
  'Normalizers change the value before validation: they run where the input is normalized ' +
  '(`normalizeForType()`, the Moost validator pipe), never inside the validator itself. ' +
  'Applies to strings: a `string` field, a union of strings and literals (with `null` / ' +
  '`undefined`), or a type alias of one (its fields and array items inherit it). ' +
  'Order: trim, then lowercase, then uppercase.'

function normalizeSpec(
  summary: string,
  example: string[],
  validate?: AnnotationSpec['config']['validate']
): AnnotationSpec {
  return new AnnotationSpec({
    description: annotationExample(`${summary} ${NOTE}`, ...example),
    nodeType: ['prop', 'type'],
    defType: ['string'],
    defTypeLiterals: true,
    multiple: false,
    validate,
  })
}

export const normalizeAnnotations: TAnnotationsTree = {
  trim: normalizeSpec('Removes leading and trailing whitespace from the string.', [
    '@normalize.trim',
    'name: string',
  ]),

  lowercase: normalizeSpec('Converts the string to lower case.', [
    '@normalize.trim',
    '@normalize.lowercase',
    'email: string.email',
  ]),

  uppercase: normalizeSpec(
    'Converts the string to upper case.',
    ['@normalize.uppercase', 'countryCode: string'],
    mainToken =>
      mainToken.parentNode?.annotations?.some(a => a.name === 'normalize.lowercase')
        ? [
            {
              message:
                '@normalize.lowercase has no effect beside @normalize.uppercase (uppercase runs last)',
              range: mainToken.range,
              severity: TSeverity.Warning,
            },
          ]
        : []
  ),
}
