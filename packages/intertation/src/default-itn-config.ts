/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { TItnDocumentConfig } from './document'
import { SemanticPrimitiveNode } from './parser/nodes'

export function getDefaultItnConfig(): TItnDocumentConfig {
  const defaultItnConfig: TItnDocumentConfig = {
    primitives: new Map(),
    annotations: {},
  }

  defaultItnConfig.primitives!.set(
    'string',
    new SemanticPrimitiveNode('string', {
      documentation: '',
    })
  )

  defaultItnConfig.primitives!.set(
    'number',
    new SemanticPrimitiveNode('number', {
      documentation: '',
    })
  )

  defaultItnConfig.primitives!.set(
    'boolean',
    new SemanticPrimitiveNode('boolean', {
      documentation: '',
    })
  )

  defaultItnConfig.primitives!.set(
    'true',
    new SemanticPrimitiveNode('true', {
      documentation: '',
    })
  )

  defaultItnConfig.primitives!.set(
    'false',
    new SemanticPrimitiveNode('false', {
      documentation: '',
    })
  )

  defaultItnConfig.primitives!.set(
    'null',
    new SemanticPrimitiveNode('null', {
      documentation: '',
    })
  )

  defaultItnConfig.primitives!.set(
    'void',
    new SemanticPrimitiveNode('void', {
      documentation: '',
    })
  )

  defaultItnConfig.primitives!.set(
    'undefined',
    new SemanticPrimitiveNode('undefined', {
      documentation: '',
    })
  )

  return defaultItnConfig
}
