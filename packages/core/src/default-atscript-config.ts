/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { TAtscriptDocConfig } from './document'
import { SemanticPrimitiveNode } from './parser/nodes'

export function getDefaulTAtscriptConfig(): TAtscriptDocConfig {
  const defaulTAtscriptConfig: TAtscriptDocConfig = {
    primitives: new Map(),
    annotations: {},
  }

  defaulTAtscriptConfig.primitives!.set(
    'never',
    new SemanticPrimitiveNode('never', {
      documentation: 'Represents impossible type.',
    })
  )

  defaulTAtscriptConfig.primitives!.set(
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

  defaulTAtscriptConfig.primitives!.set(
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

  defaulTAtscriptConfig.primitives!.set(
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

  defaulTAtscriptConfig.primitives!.set(
    'null',
    new SemanticPrimitiveNode('null', {
      type: 'null',
      documentation: 'Represents NULL value.',
    })
  )

  defaulTAtscriptConfig.primitives!.set(
    'void',
    new SemanticPrimitiveNode('void', {
      type: 'void',
      documentation: 'Represents no value.',
    })
  )

  defaulTAtscriptConfig.primitives!.set(
    'undefined',
    new SemanticPrimitiveNode('undefined', {
      type: 'void',
      documentation: 'Represents no value.',
    })
  )

  return defaulTAtscriptConfig
}
