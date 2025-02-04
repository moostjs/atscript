/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { TAnscriptDocConfig } from './document'
import { SemanticPrimitiveNode } from './parser/nodes'

export function getDefaultAnscriptConfig(): TAnscriptDocConfig {
  const defaultAnscriptConfig: TAnscriptDocConfig = {
    primitives: new Map(),
    annotations: {},
  }

  defaultAnscriptConfig.primitives!.set(
    'never',
    new SemanticPrimitiveNode('never', {
      documentation: 'Represents impossible type.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'string',
    new SemanticPrimitiveNode('string', {
      type: 'string',
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
      type: 'number',
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
        },
      },
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'boolean',
    new SemanticPrimitiveNode('boolean', {
      type: 'boolean',
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
      type: 'null',
      documentation: 'Represents NULL value.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'void',
    new SemanticPrimitiveNode('void', {
      type: 'void',
      documentation: 'Represents no value.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'undefined',
    new SemanticPrimitiveNode('undefined', {
      type: 'void',
      documentation: 'Represents no value.',
    })
  )

  return defaultAnscriptConfig
}
