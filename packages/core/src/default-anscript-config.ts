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
      nativeTypes: {
        typescript: 'string',
        java: 'String',
        python: 'str',
        csharp: 'string',
        go: 'string',
      },
      nativeConstructors: {
        typescript: 'String',
        java: 'String',
        python: 'str',
        csharp: 'String',
        go: 'string',
      },
      documentation: 'Represents textual data.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'number',
    new SemanticPrimitiveNode('number', {
      nativeTypes: {
        typescript: 'number',
        java: 'double',
        python: 'int',
        csharp: 'double',
        go: 'float64',
      },
      nativeConstructors: {
        typescript: 'Number',
        java: 'Double',
        python: 'int',
        csharp: 'Double',
        go: 'float64',
      },
      documentation: 'Represents numeric data.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'float',
    new SemanticPrimitiveNode('float', {
      nativeTypes: {
        typescript: 'number',
        java: 'float',
        python: 'float',
        csharp: 'float',
        go: 'float32',
      },
      nativeConstructors: {
        typescript: 'Number',
        java: 'Float',
        python: 'float',
        csharp: 'Single',
        go: 'float32',
      },
      documentation: 'Represents a single-precision floating-point number.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'double',
    new SemanticPrimitiveNode('double', {
      nativeTypes: {
        typescript: 'number',
        java: 'double',
        python: 'float',
        csharp: 'double',
        go: 'float64',
      },
      nativeConstructors: {
        typescript: 'Number',
        java: 'Double',
        python: 'float',
        csharp: 'Double',
        go: 'float64',
      },
      documentation: 'Represents a double-precision floating-point number.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'int',
    new SemanticPrimitiveNode('int', {
      nativeTypes: {
        typescript: 'number',
        java: 'int',
        python: 'int',
        csharp: 'int',
        go: 'int',
      },
      nativeConstructors: {
        typescript: 'Number',
        java: 'Integer',
        python: 'int',
        csharp: 'Int32',
        go: 'int',
      },
      documentation: 'Represents an integer.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'boolean',
    new SemanticPrimitiveNode('boolean', {
      nativeTypes: {
        typescript: 'boolean',
        java: 'boolean',
        python: 'bool',
        csharp: 'bool',
        go: 'bool',
      },
      nativeConstructors: {
        typescript: 'Boolean',
        java: 'Boolean',
        python: 'bool',
        csharp: 'Boolean',
        go: 'bool',
      },
      documentation: 'Represents true/false values.',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'true',
    new SemanticPrimitiveNode('true', {
      nativeTypes: {
        typescript: 'boolean',
        java: 'boolean',
        python: 'bool',
        csharp: 'bool',
        go: 'bool',
      },
      nativeConstructors: {
        typescript: 'Boolean',
        java: 'Boolean',
        python: 'bool',
        csharp: 'Boolean',
        go: 'bool',
      },
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'true',
    new SemanticPrimitiveNode('false', {
      nativeTypes: {
        typescript: 'boolean',
        java: 'boolean',
        python: 'bool',
        csharp: 'bool',
        go: 'bool',
      },
      nativeConstructors: {
        typescript: 'Boolean',
        java: 'Boolean',
        python: 'bool',
        csharp: 'Boolean',
        go: 'bool',
      },
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'null',
    new SemanticPrimitiveNode('null', {
      nativeTypes: {
        typescript: 'null',
        java: 'Object',
        python: 'None',
        csharp: 'object',
        go: 'interface{}',
      },
      nativeConstructors: {
        typescript: 'Object',
        java: 'Object',
        python: 'None',
        csharp: 'Object',
        go: 'interface{}',
      },
      documentation: '',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'void',
    new SemanticPrimitiveNode('void', {
      nativeTypes: {
        typescript: 'undefined',
        java: '',
        python: 'None',
        csharp: 'void',
        go: '',
      },
      nativeConstructors: {
        typescript: 'undefined',
        java: '',
        python: 'None',
        csharp: 'void',
        go: '',
      },
      documentation: 'Represents no value (function return).',
    })
  )

  defaultAnscriptConfig.primitives!.set(
    'undefined',
    new SemanticPrimitiveNode('undefined', {
      nativeTypes: {
        typescript: 'undefined',
        java: '',
        python: 'None',
        csharp: 'object',
        go: 'interface{}',
      },
      nativeConstructors: {
        typescript: 'undefined',
        java: '',
        python: 'None',
        csharp: 'object',
        go: 'interface{}',
      },
      documentation: '',
    })
  )

  return defaultAnscriptConfig
}
