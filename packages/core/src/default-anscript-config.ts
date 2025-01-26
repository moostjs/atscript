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
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'number',
    new SemanticPrimitiveNode('number', {
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'boolean',
    new SemanticPrimitiveNode('boolean', {
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'true',
    new SemanticPrimitiveNode('true', {
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'false',
    new SemanticPrimitiveNode('false', {
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'null',
    new SemanticPrimitiveNode('null', {
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'void',
    new SemanticPrimitiveNode('void', {
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'undefined',
    new SemanticPrimitiveNode('undefined', {
      documentation: '',
    })
  )

  return defaultAnscriptConfig
}
