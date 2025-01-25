/* eslint-disable complexity */
/* eslint-disable sonarjs/cognitive-complexity */
import type { TAnnotationsTree } from '../config'
import type { Token } from '../parser/token'
import type { TMessages } from '../parser/types'

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
export interface TAnnotationSpecConfig {
  description?: string
  arguments?: Array<{
    optional?: boolean
    name: string
    type: 'string' | 'number' | 'boolean'
    description?: string
    values?: string[]
  }>
}

export class AnnotationSpec {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public readonly __is_annotation_spec = true

  constructor(public readonly config: TAnnotationSpecConfig) {}

  get argumentsSnippet(): string {
    if (!this.config.arguments || this.config.arguments.length === 0) {
      return ''
    }
    return this.config.arguments
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
    valueText: string,
    type: 'string' | 'number' | 'boolean'
  ): string | undefined {
    switch (type) {
      case 'string': {
        // For strings, we usually accept everything.
        // If you need quotes, you can do extra checks, e.g. if it starts/ends with quotes.
        return undefined
      }
      case 'number': {
        const num = Number(valueText)
        if (Number.isNaN(num)) {
          return `Expected a number, but got "${valueText}".`
        }
        return undefined
      }
      case 'boolean': {
        if (valueText !== 'true' && valueText !== 'false') {
          return `Expected a boolean (true/false), but got "${valueText}".`
        }
        return undefined
      }
      default: {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        return `Unknown type "${type}".`
      }
    }
  }

  validate(mainToken: Token, args: Token[]): TMessages | undefined {
    const messages: TMessages = []
    const specArgs = this.config.arguments ?? []

    // 1. Check for correct number of arguments
    const requiredCount = specArgs.filter(a => !a.optional).length

    if (args.length < requiredCount) {
      messages.push({
        severity: 1,
        message: `Expected at least ${requiredCount} arguments, but got ${args.length}.`,
        range: mainToken.range,
      })
    }

    if (args.length > specArgs.length) {
      // Highlight extra arguments
      for (let i = specArgs.length; i < args.length; i++) {
        messages.push({
          severity: 1,
          message: `Too many arguments. "${args[i].text}" is not expected.`,
          range: args[i].range,
        })
      }
    }

    // 2. Validate each argument by index
    for (const [i, token] of args.entries()) {
      // If no corresponding spec, it's already an error above
      if (i >= specArgs.length) {
        break
      }

      const argSpec = specArgs[i]
      const valueText = token.text

      // 2a. Check type
      const typeMessage = this.validateType(valueText, argSpec.type)
      if (typeMessage) {
        messages.push({
          severity: 1,
          message: `Argument #${i + 1} ("${argSpec.name}"): ${typeMessage}`,
          range: token.range,
        })
        continue
      }

      // 2b. If the spec has an allowed values list, verify membership
      if (argSpec.values && !argSpec.values.includes(valueText)) {
        messages.push({
          severity: 1,
          message: `Argument #${i + 1} ("${
            argSpec.name
          }"): "${valueText}" not in [${argSpec.values.join(', ')}]`,
          range: token.range,
        })
      }
    }

    return messages.length > 0 ? messages : undefined
  }

  renderDoc(index: number | string) {
    if (typeof index === 'number') {
      const a = this.config.arguments?.[index]
      if (a) {
        return `### \`${a.name}${a.optional ? '?' : ''}: ${a.type}\`\n\n${a.description}`
      }
    } else {
      const args = this.config.arguments || []
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
