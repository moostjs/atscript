/* eslint-disable complexity */
/* eslint-disable sonarjs/cognitive-complexity */
import type { TAnnotationsTree } from '../config'
import { AtscriptDoc } from '../document'
import type { TNodeEntity } from '../parser/nodes'
import type { Token } from '../parser/token'
import type { TMessages } from '../parser/types'
import type { TLexicalToken } from '../tokenizer/types'

export interface TAnnotationArgument {
  optional?: boolean
  name: string
  type: 'string' | 'number' | 'boolean'
  description?: string
  values?: string[]
}

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
export interface TAnnotationSpecConfig {
  multiple?: boolean
  description?: string
  nodeType?: TNodeEntity[]
  argument?: TAnnotationArgument[] | TAnnotationArgument
  validate?: (mainToken: Token, args: Token[], doc: AtscriptDoc) => TMessages | undefined
  modify?: (mainToken: Token, args: Token[], doc: AtscriptDoc) => void
}

export class AnnotationSpec {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public readonly __is_annotation_spec = true

  constructor(public readonly config: TAnnotationSpecConfig) {}

  get arguments(): TAnnotationArgument[] {
    if (!this.config.argument) {
      return []
    }
    return Array.isArray(this.config.argument) ? this.config.argument : [this.config.argument]
  }

  get argumentsSnippet(): string {
    if (this.arguments.length === 0) {
      return ''
    }
    return this.arguments
      .map((arg, index) => {
        const placeholderIndex = index + 1 // Snippet placeholders are 1-based
        const defaultValue = this.getDefaultValueForType(arg.name, arg.type)
        const quote = arg.type === 'string' ? `'` : ''
        return `${quote}\${${placeholderIndex}:${defaultValue}}${quote}`
      })
      .join(', ')
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private validateType(
    tokenType: TLexicalToken['type'],
    type: 'string' | 'number' | 'boolean'
  ): string | undefined {
    // tokenType:
    //   identifier
    //   text
    //   number
    switch (type) {
      case 'string': {
        return tokenType === 'text' ? undefined : 'string expected.'
      }
      case 'number': {
        return tokenType === 'number' ? undefined : 'number expected.'
      }
      case 'boolean': {
        return tokenType === 'identifier' ? undefined : 'boolean expected.'
      }
      default: {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        return `unknown type "${type}".`
      }
    }
  }

  modify(mainToken: Token, args: Token[], doc: AtscriptDoc): void {
    if (this.config.modify) {
      this.config.modify(mainToken, args, doc)
    }
  }

  validate(mainToken: Token, args: Token[], doc: AtscriptDoc): TMessages | undefined {
    const messages: TMessages = []
    const specArgs = this.arguments

    if (!mainToken.parentNode) {
      return
    }

    // 0. Check multiple
    if (
      mainToken.parentNode.countAnnotations(mainToken.text.slice(1)) > 1 &&
      !this.config.multiple
    ) {
      messages.push({
        severity: 1,
        message: `Multiple "${mainToken.text}" annotations are not allowed.`,
        range: mainToken.range,
      })
    }

    // 1. Check node type
    if (
      this.config.nodeType &&
      this.config.nodeType.length > 0 &&
      !this.config.nodeType.includes(mainToken.parentNode.entity)
    ) {
      messages.push({
        severity: 1,
        message: `${mainToken.text} applies only to ${this.config.nodeType.join(', ')} nodes.`,
        range: mainToken.range,
      })
    }

    // 2. Check for correct number of arguments
    const requiredCount = specArgs.filter(a => !a.optional).length

    if (args.length < requiredCount) {
      messages.push({
        severity: 1,
        message: `${mainToken.text} requires at least ${requiredCount} arguments, but got ${args.length}.`,
        range: mainToken.range,
      })
    }

    if (args.length > specArgs.length) {
      // Highlight extra arguments
      const i = specArgs.length
      messages.push({
        severity: 1,
        message: `${mainToken.text} got ${args.length} arguments, expected ${specArgs.length}.`,
        range: {
          start: args[i].range.start,
          end: args[args.length - 1].range.end,
        },
      })
    }

    // 3. Validate each argument by index
    // eslint-disable-next-line unicorn/no-for-loop
    for (let i = 0; i < args.length; i++) {
      const token = args[i]
      // If no corresponding spec, it's already an error above
      if (i >= specArgs.length) {
        break
      }

      const argSpec = specArgs[i]
      const tokenType = token.type
      const valueText = token.text

      // 3a. Check type
      const typeMessage = this.validateType(tokenType, argSpec.type)
      if (typeMessage) {
        messages.push({
          severity: 1,
          message: `${mainToken.text} at argument #${i + 1}: ${typeMessage}`,
          range: token.range,
        })
        continue
      }

      // 3b. If the spec has an allowed values list, verify membership
      const values = argSpec.type === 'boolean' ? ['true', 'false'] : argSpec.values
      if (values && !values.includes(valueText)) {
        messages.push({
          severity: 1,
          message: `${mainToken.text} at argument #${i + 1} ("${
            argSpec.name
          }") must be one of [${values.join(', ')}]`,
          range: token.range,
        })
      }
    }

    if (this.config.validate) {
      messages.push(...(this.config.validate(mainToken, args, doc) || []))
    }

    return messages.length > 0 ? messages : undefined
  }

  renderDocs(index: number | string) {
    if (typeof index === 'number') {
      const a = this.arguments[index]
      if (a) {
        const values = a.values ? `\n\nValues:\n${a.values.join(', ')}` : ''
        return `### \`${a.name}${a.optional ? '?' : ''}: ${a.type}\`\n\n${a.description}${values}`
      }
    } else {
      const args = this.arguments
      return `### ${index} ${args
        .map(a => `\`${a.name}${a.optional ? '?' : ''}: ${a.type}\``)
        .join(', ')}\n\n${this.config.description}`
    }
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  protected getDefaultValueForType(name: string, type: 'string' | 'number' | 'boolean'): string {
    switch (type) {
      case 'string': {
        return name
      }
      case 'number': {
        return '0'
      }
      case 'boolean': {
        return 'true'
      }
      default: {
        return ''
      }
    }
  }
}

export function isAnnotationSpec(a?: TAnnotationsTree | AnnotationSpec): a is AnnotationSpec {
  return Boolean(a) && (a as AnnotationSpec).__is_annotation_spec
}

export function resolveAnnotation(
  name: string,
  annotationsTree?: TAnnotationsTree
): AnnotationSpec | undefined {
  const parts = name.split('.')
  let current: TAnnotationsTree | AnnotationSpec | undefined = annotationsTree
  for (const part of parts) {
    if (!current || isAnnotationSpec(current)) {
      return undefined
    }
    current = current[part]
  }
  return isAnnotationSpec(current) ? current : undefined
}
