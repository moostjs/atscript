/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { TAnscriptDocConfig } from './document'
import { SemanticPrimitiveNode } from './parser/nodes'

export function getDefaultAnscriptConfig(): TAnscriptDocConfig {
  const defaultAnscriptConfig: TAnscriptDocConfig = {
    primitives: new Map(),
    annotations: {},
  }

  defaultAnscriptConfig.primitives!.set(
    'string',
    new SemanticPrimitiveNode('string', {
      base: 'string',
      lang: {
        typescript: 'string',
      },
      documentation: 'Represents textual data.',
      extensions: {
        email: {
          documentation: 'Represents an email address.',
        },
        phone: {
          documentation: 'Represents an phone number.',
        },
      },
    })
  )

  const positive = {
    documentation: 'Number that greater than or equal to zero.',
  }

  const negative = {
    documentation: 'Number that less than or equal to zero.',
  }

  const positiveOrNegative = {
    positive,
    negative,
  }

  defaultAnscriptConfig.primitives!.set(
    'number',
    new SemanticPrimitiveNode('number', {
      base: 'numeric',
      lang: {
        typescript: 'number',
      },
      documentation: 'Represents numeric data.',
      extensions: {
        ...positiveOrNegative,
        single: {
          extensions: positiveOrNegative,
          documentation: 'Represents a single-precision floating-point number.',
        },
        double: {
          extensions: positiveOrNegative,
          documentation: 'Represents a double-precision floating-point number.',
        },
        int: {
          extensions: positiveOrNegative,
          documentation: 'Represents an integer number.',
          lang: {
            typescript: 'number',
          },
        },
      },
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'boolean',
    new SemanticPrimitiveNode('boolean', {
      base: 'boolean',
      lang: {
        typescript: 'boolean',
      },
      documentation: 'Represents true/false values.',
      extensions: {
        true: {
          documentation: 'Represents a true value.',
        },
        false: {
          documentation: 'Represents a false value.',
        },
      },
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'null',
    new SemanticPrimitiveNode('null', {
      base: 'null',
      lang: {
        typescript: 'null',
      },
      documentation: 'Represents NULL value.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'void',
    new SemanticPrimitiveNode('void', {
      base: 'void',
      lang: {
        typescript: 'undefined',
      },
      documentation: 'Represents no value.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'undefined',
    new SemanticPrimitiveNode('undefined', {
      base: 'void',
      lang: {
        typescript: 'undefined',
      },
      documentation: 'Represents no value.',
    })
  )

  return defaultAnscriptConfig
}
