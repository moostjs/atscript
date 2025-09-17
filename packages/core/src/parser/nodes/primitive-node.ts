import { Token } from '../token'
import { SemanticNode } from './semantic-node'
import type { TPrimitiveConfig } from './types'

export class SemanticPrimitiveNode extends SemanticNode {
  constructor(
    private readonly _id: string,
    public readonly config: TPrimitiveConfig,
    private readonly parentKey: string = ''
  ) {
    super('primitive')
    this.props = new Map()
    this.tags = new Set([_id, ...(config?.tags || [])])
    for (const [ext, def] of Object.entries(config.extensions || {})) {
      const node = new SemanticPrimitiveNode(
        ext,
        {
          type: def.type ?? config.type,
          documentation: def.documentation ?? config.documentation,
          extensions: def.extensions,
          tags: Array.from(new Set([...(def.tags || []), ...Array.from(this.tags)])),
          expect: { ...config.expect, ...def.expect },
        },
        this.key
      )
      this.props.set(ext, node)
    }
    if (typeof config.type === 'object') {
      this.type = config.type.kind === 'final' ? config.type.value : config.type.kind
    } else {
      this.type = config.type
    }
    this.applyAnnotations()
  }

  protected applyAnnotations() {
    this.annotations = []
    if (this.type === 'string' || this.type === 'array') {
      if (typeof this.config.expect?.minLength === 'number') {
        this.annotations.push({
          name: 'expect.minLength',
          token: dummyToken,
          args: [num(this.config.expect.minLength)],
        })
      }
      if (typeof this.config.expect?.maxLength === 'number') {
        this.annotations.push({
          name: 'expect.maxLength',
          token: dummyToken,
          args: [num(this.config.expect.maxLength)],
        })
      }
    }
    if (this.type === 'string') {
      if (typeof this.config.expect?.pattern !== 'undefined') {
        const patterns = Array.isArray(this.config.expect.pattern)
          ? this.config.expect.pattern
          : [this.config.expect.pattern]
        for (const p of patterns) {
          const args: Token[] = typeof p === 'string' ? [text(p)] : [text(p.source), text(p.flags)]
          if (this.config.expect.message) {
            args[2] = text(this.config.expect.message)
          }
          this.annotations.push({
            name: 'expect.pattern',
            token: dummyToken,
            args,
          })
        }
      }
    }
    if (this.type === 'number') {
      if (typeof this.config.expect?.min === 'number') {
        this.annotations.push({
          name: 'expect.min',
          token: dummyToken,
          args: [num(this.config.expect.min)],
        })
      }
      if (typeof this.config.expect?.max === 'number') {
        this.annotations.push({
          name: 'expect.max',
          token: dummyToken,
          args: [num(this.config.expect.max)],
        })
      }
      if (this.config.expect?.int === true) {
        this.annotations.push({
          name: 'expect.int',
          token: dummyToken,
          args: [],
        })
      }
    }
  }

  public readonly type?:
    | 'union'
    | 'intersection'
    | 'tuple'
    | 'array'
    | 'object'
    | 'string'
    | 'number'
    | 'boolean'
    | 'void'
    | 'null'

  get key() {
    return this.parentKey ? `${this.parentKey}.${this._id}` : this._id
  }

  getAllTags(_processed?: Set<SemanticPrimitiveNode>): string[] {
    const allTags = [this._id]
    const processed = _processed || new Set<SemanticPrimitiveNode>()
    processed.add(this)
    for (const [, node] of this.props) {
      if (processed.has(node)) {
        continue
      }
      processed.add(node)
      allTags.push(...node.getAllTags(processed))
    }
    return allTags
  }

  get id() {
    return this._id
  }

  get documentation() {
    return this.config.documentation
      ? `**${this.key}** - ${this.config.documentation}`
      : `**${this.key}**`
  }

  public readonly props: Map<string, SemanticPrimitiveNode>
  public readonly tags: Set<string>

  toString(level = 0, prefix = '●') {
    const indent = ' '.repeat(level * 2)
    let s = `${this.renderAnnotations()}${prefix} [${this.entity}] ${JSON.stringify(
      this.config.type
    )}`
    s += this.renderChildren()
    return indent + s.split('\n').join(`\n${indent}`)
  }
}

const dummyToken = new Token({
  getRange: () => ({ end: { character: 0, line: 0 }, start: { character: 0, line: 0 } }),
  text: '',
  type: 'identifier',
})

const num = (val: number) =>
  new Token({
    getRange: () => ({ end: { character: 0, line: 0 }, start: { character: 0, line: 0 } }),
    text: val.toString(),
    type: 'number',
  })
const text = (val: string) =>
  new Token({
    getRange: () => ({ end: { character: 0, line: 0 }, start: { character: 0, line: 0 } }),
    text: val,
    type: 'text',
  })
