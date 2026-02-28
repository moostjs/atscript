import type { AnnotationSpec } from '../../annotations'
import { resolveAnnotation } from '../../annotations'
import type { TAnnotationsTree } from '../../config'
import { Token } from '../token'
import { SemanticNode } from './semantic-node'
import type { TAnnotationTokens, TPrimitiveConfig } from './types'

export class SemanticPrimitiveNode extends SemanticNode {
  constructor(
    private readonly _id: string,
    public readonly config: TPrimitiveConfig,
    private readonly parentKey: string = '',
    private readonly annotationTree?: TAnnotationsTree
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
          annotations: { ...config.annotations, ...def.annotations },
        },
        this.key,
        this.annotationTree
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
    for (const [name, value] of Object.entries(this.config.annotations || {})) {
      const spec = this.annotationTree ? resolveAnnotation(name, this.annotationTree) : undefined
      const isMultiple = spec?.config.multiple ?? false

      if (Array.isArray(value)) {
        if (isMultiple) {
          for (const item of value) {
            this.annotations.push(toAnnotationTokens(name, item, spec))
          }
        } else {
          // multiple:false — take only the first item
          if (value.length > 0) {
            this.annotations.push(toAnnotationTokens(name, value[0], spec))
          }
        }
      } else {
        this.annotations.push(toAnnotationTokens(name, value, spec))
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
    | 'phantom'

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

function toAnnotationTokens(
  name: string,
  value: boolean | string | number | Record<string, string | number | boolean>,
  spec?: AnnotationSpec
): TAnnotationTokens {
  if (typeof value === 'boolean') {
    return { name, token: dummyToken, args: [] }
  }
  if (typeof value === 'string') {
    return { name, token: dummyToken, args: [text(value)] }
  }
  if (typeof value === 'number') {
    return { name, token: dummyToken, args: [num(value)] }
  }
  // Object with named args → map by spec argument names (ordered, positional)
  const argNames = spec?.arguments.map(a => a.name) ?? Object.keys(value)
  const raw: (Token | undefined)[] = argNames.map(argName => {
    const v = value[argName]
    if (v === undefined) return undefined
    return typeof v === 'number' ? num(v) : text(String(v))
  })
  // Trim trailing undefined entries, then fill inner gaps with empty-string tokens
  while (raw.length > 0 && raw[raw.length - 1] === undefined) {
    raw.pop()
  }
  const args: Token[] = raw.map(t => t ?? text(''))
  return { name, token: dummyToken, args }
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
