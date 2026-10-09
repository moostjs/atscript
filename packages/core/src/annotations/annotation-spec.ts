/* eslint-disable complexity */
/* eslint-disable sonarjs/cognitive-complexity */
import type { TAnnotationsTree } from '../config'
import type { AtscriptDoc } from '../document'
import {
  isGroup,
  isInterface,
  isPrimitive,
  isRef,
  isStructure,
  type SemanticGroup,
  type SemanticNode,
  type SemanticPrimitiveNode,
  type TNodeEntity,
} from '../parser/nodes'
import type { Token } from '../parser/token'
import type { TMessages } from '../parser/types'
import type { TLexicalToken } from '../tokenizer/types'

/**
 * Field scope of an annotation argument (returned by the `fieldScope` hook): which types
 * its field refs may name (`Type.field`) and which type an unqualified field belongs to.
 */
export interface TQueryScope {
  /** Type names a qualified field ref (`Type.field`) may use. Not used by `string` arguments. */
  allowedTypes: string[]
  /**
   * Type an unqualified field ref resolves against — for a `string` argument, the type
   * whose (dotted) field path the string names. `null` when unqualified refs are not allowed.
   */
  unqualifiedTarget: string | null
}

/** Annotation argument types written in backticks, each parsed by its own grammar. */
export type TBacktickArgKind = 'query' | 'expr' | 'order'

/** Whether an annotation argument type is written in backticks (`query`, `expr`, `order`). */
export function isBacktickArgType(type: string | undefined): type is TBacktickArgKind {
  return type === 'query' || type === 'expr' || type === 'order'
}

const BACKTICK_TYPE_MESSAGES: Record<TBacktickArgKind, string> = {
  query: 'query expression expected (use backticks).',
  expr: 'expression expected (use backticks).',
  order: 'order list expected (use backticks).',
}

/**
 * One value a `string` / `number` annotation argument may take (returned by the `valueScope`
 * hook), for editor completion and go-to-definition.
 */
export interface TValueCandidate {
  /** The argument value as written without quotes (`open` for `'open'`). */
  value: string
  /** Where the value is declared; go-to-definition on the argument jumps there. */
  definition?: { doc: AtscriptDoc; token: Token }
  /** Shown beside the value in the completion list. */
  documentation?: string
}

export interface TAnnotationArgument {
  optional?: boolean
  name: string
  /**
   * - `query`: backtick predicate (`status = 'open' and Issue.overdue = true`)
   * - `expr`: backtick arithmetic over field refs (`openCount * 10 + coalesce(overdue, 0)`):
   *   `+ - * /`, unary `-`, parentheses, numeric literals, `coalesce(a, b, …)`
   * - `order`: backtick ordering (`raisedAt desc, id`): field refs with optional `asc` / `desc`
   */
  type: 'string' | 'number' | 'boolean' | 'ref' | TBacktickArgKind
  description?: string
  values?: string[]
  /**
   * Editor field scope of a `query`, `expr`, `order` or `string` argument. Called with the
   * argument token and the document that holds it; return `undefined` when the scope cannot
   * be determined.
   * - `query` / `expr` / `order`: the types the backtick expression may reference (drives
   *   completion, hover, go-to-definition, find-references and rename of its field refs).
   * - `string`: the argument is a (dotted) field path of `unqualifiedTarget` (`'amount'`,
   *   `'address.city'`) — same editor features on the string; `allowedTypes` is unused.
   */
  fieldScope?: (argToken: Token, doc: AtscriptDoc) => TQueryScope | undefined
  /**
   * Editor value scope of a `string` or `number` argument that names one of a closed set of
   * values declared elsewhere in the document (the literals of the annotated field's union,
   * say). Called with the annotation's main token (its `parentNode` is the annotated node)
   * and the document that holds it; return `undefined` when the set cannot be determined.
   * Completion offers the candidates, go-to-definition on the argument follows
   * `TValueCandidate.definition`. Candidates are advisory — it does not validate.
   */
  valueScope?: (annotationToken: Token, doc: AtscriptDoc) => TValueCandidate[] | undefined
  /**
   * For a `ref` argument: filters the type names offered by completion.
   * Called with each candidate declaration and the document that declares it;
   * return `false` to hide the candidate. All declarations are offered when absent.
   */
  refFilter?: (decl: SemanticNode, doc: AtscriptDoc) => boolean
}

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
export interface TAnnotationSpecConfig {
  multiple?: boolean
  mergeStrategy?: 'append' | 'replace' // default 'replace'
  /**
   * Whether this annotation is inherited by a field that references the annotated
   * node via a chain-ref (e.g. `ownerId: User.id`). Defaults to `true`
   * (value/presentation annotations describe the value and travel with it).
   * Set to `false` for annotations that describe the declaring scope itself
   * (indexes, storage options, primary keys) — those must not leak into
   * referring fields. Only affects ref boundaries; `extends`/intersection
   * merging always inherits.
   */
  passedWhenReferred?: boolean
  description?: string
  nodeType?: TNodeEntity[]
  defType?: Array<SemanticPrimitiveNode['type']>
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
        const quote = arg.type === 'string' ? `'` : isBacktickArgType(arg.type) ? '`' : ''
        return `${quote}\${${placeholderIndex}:${defaultValue}}${quote}`
      })
      .join(', ')
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private validateType(
    tokenType: TLexicalToken['type'],
    type: TAnnotationArgument['type']
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
      case 'ref': {
        return tokenType === 'identifier' ? undefined : 'type reference expected.'
      }
      case 'query':
      case 'expr':
      case 'order': {
        return tokenType === 'query' ? undefined : BACKTICK_TYPE_MESSAGES[type]
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
    // Annotate block entries are ref nodes that reference props,
    // so treat 'ref' as equivalent to 'prop' for nodeType checking
    const effectiveEntity =
      mainToken.parentNode.entity === 'ref' && this.config.nodeType?.includes('prop')
        ? 'prop'
        : mainToken.parentNode.entity
    if (
      this.config.nodeType &&
      this.config.nodeType.length > 0 &&
      !this.config.nodeType.includes(effectiveEntity)
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

    // Type-introspecting checks (the `defType` target-type guard and the plugin
    // `validate` hook) are deferred to diagnostic time — see `validateDeferred`.

    return messages.length > 0 ? messages : undefined
  }

  /**
   * Cross-file-dependent validation, deferred to diagnostic time
   * (`AtscriptDoc.getDiagMessages`) where imported target types finally resolve.
   *
   * Runs the `defType` target-type guard for inline props and the
   * plugin-provided `validate` hook. Both introspect the field's resolved type
   * via `doc.unwindType`, so running them at parse time — before cross-file
   * dependencies are wired — yielded unresolved imports and spurious
   * diagnostics. Annotate-block entries' `defType` guard is handled separately
   * by `getDiagMessages` (the `referred` loop) and is skipped here.
   */
  validateDeferred(mainToken: Token, args: Token[], doc: AtscriptDoc): TMessages | undefined {
    if (!mainToken.parentNode) {
      return undefined
    }
    const messages: TMessages = []

    if (this.config.defType?.length) {
      const parentNode = mainToken.parentNode
      const idToken = isRef(parentNode) ? parentNode.token('identifier') : undefined
      const isAnnotateEntry =
        !!idToken && !!doc.annotateBlockAt(idToken.range.start.line, idToken.range.start.character)
      if (!isAnnotateEntry) {
        let def = parentNode.getDefinition()
        let defDoc = doc
        if (isRef(def)) {
          const unwound = doc.unwindType(def.id!, def.chain)
          def = unwound?.def || def
          defDoc = unwound?.doc || doc
        }
        messages.push(...(this.validateTargetType(def, mainToken.range, defDoc) || []))
      }
    }

    if (this.config.validate) {
      messages.push(...(this.config.validate(mainToken, args, doc) || []))
    }

    return messages.length > 0 ? messages : undefined
  }

  /**
   * Checks an already-resolved target node against this annotation's `defType`
   * guard (e.g. `@expect.minLength` requires `string | array`). Returns a
   * diagnostic when the type doesn't match, or `undefined` when it matches or no
   * guard is configured. Shared by the parse-time check (for inline props) and
   * the deferred annotate-entry check in `AtscriptDoc.getDiagMessages`, where
   * imported target types finally resolve.
   *
   * A union also matches when every member other than `null` / `undefined`
   * matches (`number | null`, `string[] | null`, an alias of such a union).
   * Union members are refs, so `doc` (the document the union is declared in) is
   * needed to resolve them; without it a union never matches.
   */
  validateTargetType(
    def: SemanticNode | undefined,
    range: Token['range'],
    doc?: AtscriptDoc
  ): TMessages | undefined {
    const defType = this.config.defType
    if (!defType?.length) {
      return undefined
    }
    if (matchesDefType(def, defType)) {
      return undefined
    }
    let got: string
    if (isGroup(def) && def.entity !== 'tuple' && def.op !== '&') {
      const members = doc ? nonNullishMembers(def, doc) : undefined
      if (members?.length && members.every(m => matchesDefType(m, defType))) {
        return undefined
      }
      got = `union (${describeUnionMembers(def, doc)})`
    } else {
      got = `"${describeNode(def)}"`
    }
    return [
      {
        message: `Expected type is (${defType.join(' | ')}), got ${got}`,
        severity: 1,
        range,
      },
    ]
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
  protected getDefaultValueForType(name: string, type: TAnnotationArgument['type']): string {
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
      case 'ref': {
        return 'TypeName'
      }
      case 'query': {
        return 'field = value'
      }
      case 'expr': {
        return 'field + 1'
      }
      case 'order': {
        return 'field asc'
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
    if (part === '$self') {
      return undefined
    }
    if (!current || isAnnotationSpec(current)) {
      return undefined
    }
    current = current[part]
  }
  if (isAnnotationSpec(current)) {
    return current
  }
  if (current && !isAnnotationSpec(current) && current.$self) {
    return current.$self
  }
  return undefined
}

/** `null` / `undefined` / `void` primitive. */
function isNullishPrimitive(node: SemanticNode | undefined): boolean {
  return isPrimitive(node) && (node.type === 'null' || node.type === 'void')
}

/** Whether a resolved node satisfies a `defType` guard (a union as a whole, not its members). */
function matchesDefType(
  def: SemanticNode | undefined,
  defType: Array<SemanticPrimitiveNode['type']>
): boolean {
  return defType.includes(describeNode(def) as SemanticPrimitiveNode['type'])
}

/** The `defType` vocabulary name of a resolved node (`string`, `object`, `union`, `array`, …). */
function describeNode(def: SemanticNode | undefined): string {
  if (isPrimitive(def)) {
    return def.type || 'unknown'
  }
  if (isInterface(def) || isStructure(def)) {
    return 'object'
  }
  if (isGroup(def) && def.entity !== 'tuple') {
    return def.op === '&' ? 'intersection' : 'union'
  }
  return def?.entity || 'unknown'
}

/** Walks a `|` union (flattening nested unions and union aliases), resolving member refs. */
function walkUnionMembers(
  def: SemanticNode,
  doc: AtscriptDoc | undefined,
  cb: (member: SemanticNode | undefined) => void,
  seen = new Set<SemanticNode>()
): void {
  if (seen.has(def)) {
    return
  }
  seen.add(def)
  for (const item of (def as SemanticGroup).unwrap()) {
    let member: SemanticNode | undefined = item
    let memberDoc = doc
    if (isRef(member)) {
      const unwound = doc?.unwindType(member.id!, member.chain)
      member = unwound?.def
      memberDoc = unwound?.doc || doc
    }
    if (isGroup(member) && member.entity !== 'tuple' && member.op !== '&') {
      walkUnionMembers(member, memberDoc, cb, seen)
    } else {
      cb(member)
    }
  }
}

function describeUnionMembers(def: SemanticNode, doc: AtscriptDoc | undefined): string {
  const names: string[] = []
  walkUnionMembers(def, doc, m => {
    const name = describeNode(m)
    if (!names.includes(name)) {
      names.push(name)
    }
  })
  return names.join(' | ')
}

/**
 * Resolved members of a union other than `null` / `undefined`, or `undefined`
 * when `def` is not a union. Nested unions and union aliases are flattened and
 * member refs are resolved through `doc` (the document `def` is declared in);
 * members that can't be resolved are left out (they are reported as unknown
 * identifiers elsewhere).
 *
 * Use it in an annotation's `validate` hook to accept nullable targets, e.g.
 * treat `string | null` like `string`:
 *
 * ```ts
 * const members = nonNullishMembers(def, doc)
 * const ok = members ? members.length > 0 && members.every(isWanted) : isWanted(def)
 * ```
 */
export function nonNullishMembers(
  def: SemanticNode | undefined,
  doc: AtscriptDoc
): SemanticNode[] | undefined {
  if (!isGroup(def) || def.entity === 'tuple' || def.op === '&') {
    return undefined
  }
  const members: SemanticNode[] = []
  walkUnionMembers(def, doc, m => {
    if (m && !isNullishPrimitive(m)) {
      members.push(m)
    }
  })
  return members
}
