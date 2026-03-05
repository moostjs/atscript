import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'
import {
  isArray,
  isInterface,
  isPrimitive,
  isRef,
  isStructure,
  type SemanticNode,
  type SemanticRefNode,
  type SemanticStructureNode,
} from '../parser/nodes'
import type { Token } from '../parser/token'
import type { TMessages } from '../parser/types'
import { findFKFieldsPointingTo } from './db-utils'

/**
 * Traverse from annotation token → prop → structure → interface
 * to check if the parent interface has @db.table.
 */
function getDbTableOwner(token: Token): SemanticNode | undefined {
  const field = token.parentNode!
  const struct = field.ownerNode
  if (!struct || !isStructure(struct)) return undefined
  const iface = struct.ownerNode
  return (iface && isInterface(iface)) ? iface : struct
}

/**
 * Get the parent structure node from an annotation token.
 */
function getParentStruct(token: Token): SemanticStructureNode | undefined {
  const field = token.parentNode!
  const struct = field.ownerNode
  return (struct && isStructure(struct)) ? struct as SemanticStructureNode : undefined
}

/**
 * Get the parent interface name (for error messages and cross-type resolution).
 */
function getParentTypeName(token: Token): string | undefined {
  const struct = getParentStruct(token)
  if (!struct) return undefined
  const iface = struct.ownerNode
  return (iface && isInterface(iface)) ? iface.id! : struct.id
}

/**
 * Extract target type name from a navigational field definition.
 * Unwraps arrays (e.g., `Post[]` → `Post`).
 */
function getNavTargetTypeName(field: SemanticNode): string | undefined {
  let def = field.getDefinition()
  if (isArray(def)) def = def?.getDefinition()
  if (isRef(def)) return def.id!
  return undefined
}

/**
 * Get the alias argument from an annotation on a field.
 */
function getAnnotationAlias(prop: SemanticNode, annotationName: string): string | undefined {
  const annotations = prop.annotations?.filter(a => a.name === annotationName)
  if (!annotations || annotations.length === 0) return undefined
  return annotations[0].args.length > 0 ? annotations[0].args[0].text : undefined
}

/**
 * Factory for @db.rel.onDelete / @db.rel.onUpdate — identical validation logic,
 * only the annotation name and description verb differ.
 */
function refActionAnnotation(name: 'onDelete' | 'onUpdate'): AnnotationSpec {
  return new AnnotationSpec({
    description:
      `Referential action when the target ${name === 'onDelete' ? 'row is deleted' : 'key is updated'}. Only valid on @db.rel.FK fields.\n\n` +
      '**Example:**\n' +
      '```atscript\n' +
      '@db.rel.FK\n' +
      `@db.rel.${name} "cascade"\n` +
      'authorId: User.id\n' +
      '```\n',
    nodeType: ['prop'],
    argument: {
      name: 'action',
      type: 'string',
      values: ['cascade', 'restrict', 'noAction', 'setNull', 'setDefault'],
      description: 'Referential action: "cascade", "restrict", "noAction", "setNull", or "setDefault".',
    },
    validate(token, args, doc) {
      const errors = [] as TMessages
      const field = token.parentNode!

      if (field.countAnnotations('db.rel.FK') === 0) {
        errors.push({
          message: `@db.rel.${name} is only valid on @db.rel.FK fields`,
          severity: 1,
          range: token.range,
        })
      }

      if (args[0]) {
        const action = args[0].text

        if (action === 'setNull' && !field.has('optional')) {
          errors.push({
            message: `@db.rel.${name} "setNull" requires the FK field to be optional (?)`,
            severity: 1,
            range: token.range,
          })
        }

        if (action === 'setDefault' &&
          field.countAnnotations('db.default.value') === 0 &&
          field.countAnnotations('db.default.fn') === 0
        ) {
          errors.push({
            message: `@db.rel.${name} "setDefault" but no @db.default.* annotation — field will have no fallback value`,
            severity: 2,
            range: token.range,
          })
        }
      }

      // D5: Multiple onDelete/onUpdate in same composite FK group
      const fkAlias = getAnnotationAlias(field, 'db.rel.FK')
      if (fkAlias) {
        const struct = getParentStruct(token)
        if (struct) {
          const annotationName = `db.rel.${name}`
          let count = 0
          for (const [, prop] of struct.props) {
            if (prop.countAnnotations('db.rel.FK') === 0) continue
            if (prop.countAnnotations(annotationName) === 0) continue
            const propFkAlias = getAnnotationAlias(prop, 'db.rel.FK')
            if (propFkAlias === fkAlias) count++
          }
          if (count > 1) {
            errors.push({
              message: `Composite FK '${fkAlias}' has @db.rel.${name} on multiple fields — declare it on exactly one`,
              severity: 1,
              range: token.range,
            })
          }
        }
      }

      return errors
    },
  })
}

export const dbAnnotations: TAnnotationsTree = {
  patch: {
    strategy: new AnnotationSpec({
      description:
        'Defines the **patching strategy** for updating nested objects.\n\n' +
        '- **"replace"** → The field or object will be **fully replaced**.\n' +
        '- **"merge"** → The field or object will be **merged recursively** (applies only to objects, not arrays).\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.patch.strategy "merge"\n' +
        'settings: {\n' +
        '  notifications: boolean\n' +
        '  preferences: {\n' +
        '    theme: string\n' +
        '  }\n' +
        '}\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: false,
      argument: {
        name: 'strategy',
        type: 'string',
        description: 'The **patch strategy** for this field: `"replace"` (default) or `"merge"`.',
        values: ['replace', 'merge'],
      },
      validate(token, args, doc) {
        const field = token.parentNode!
        const errors = [] as TMessages
        const definition = field.getDefinition()
        if (!definition) {
          return errors
        }
        let wrongType = false
        if (isRef(definition)) {
          const def = doc.unwindType(definition.id!, definition.chain)?.def
          if (!isStructure(def) && !isInterface(def) && !isArray(def)) {
            wrongType = true
          }
        } else if (!isStructure(definition) && !isInterface(definition) && !isArray(definition)) {
          wrongType = true
        }
        if (wrongType) {
          errors.push({
            message: `@db.patch.strategy requires a field of type object or array`,
            severity: 1,
            range: token.range,
          })
        }
        return errors
      },
    }),
  },

  table: new AnnotationSpec({
    description:
      'Marks an interface as a database-persisted entity (table in SQL, collection in MongoDB). ' +
      'If the name argument is omitted, the adapter derives the table name from the interface name.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.table "users"\n' +
      'export interface User { ... }\n' +
      '```\n',
    nodeType: ['interface'],
    argument: {
      optional: true,
      name: 'name',
      type: 'string',
      description: 'Table/collection name. If omitted, derived from interface name.',
    },
  }),

  schema: new AnnotationSpec({
    description:
      'Assigns the entity to a database schema/namespace.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.table "users"\n' +
      '@db.schema "auth"\n' +
      'export interface User { ... }\n' +
      '```\n',
    nodeType: ['interface'],
    argument: {
      name: 'name',
      type: 'string',
      description: 'Schema/namespace name.',
    },
  }),

  index: {
    plain: new AnnotationSpec({
      description:
        'Standard (non-unique) index for query performance. ' +
        'Fields sharing the same index name form a composite index.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.index.plain "idx_timeline", "desc"\n' +
        'createdAt: number.timestamp\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: true,
      mergeStrategy: 'append',
      argument: [
        {
          optional: true,
          name: 'name',
          type: 'string',
          description: 'Index name / composite group name.',
        },
        {
          optional: true,
          name: 'sort',
          type: 'string',
          values: ['asc', 'desc'],
          description: 'Sort direction. Defaults to "asc".',
        },
      ],
    }),

    unique: new AnnotationSpec({
      description:
        'Unique index — ensures no two rows/documents have the same value(s). ' +
        'Fields sharing the same index name form a composite unique constraint.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.index.unique "tenant_email"\n' +
        'email: string.email\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: true,
      mergeStrategy: 'append',
      argument: {
        optional: true,
        name: 'name',
        type: 'string',
        description: 'Index name / composite group name.',
      },
    }),

    fulltext: new AnnotationSpec({
      description:
        'Full-text search index. ' +
        'Fields sharing the same index name form a composite full-text index.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.index.fulltext "ft_content"\n' +
        'title: string\n' +
        '\n' +
        '@db.index.fulltext "ft_content", 5\n' +
        'bio: string\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: true,
      mergeStrategy: 'append',
      argument: [
        {
          optional: true,
          name: 'name',
          type: 'string',
          description: 'Index name / composite group name.',
        },
        {
          optional: true,
          name: 'weight',
          type: 'number',
          description:
            'Field importance in search results (higher = more relevant). ' +
            'Defaults to `1`. Supported by databases with weighted fulltext (e.g., MongoDB, PostgreSQL).',
        },
      ],
    }),
  },

  column: new AnnotationSpec({
    description:
      'Overrides the physical column/document-field name in the database.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.column "first_name"\n' +
      'firstName: string\n' +
      '```\n',
    nodeType: ['prop'],
    argument: {
      name: 'name',
      type: 'string',
      description: 'The actual column/field name in the DB.',
    },
  }),

  default: {
    value: new AnnotationSpec({
      description:
        'Sets a static DB-level default value (used in DDL DEFAULT clause). ' +
        'For string fields the value is used as-is; for other types it is parsed as JSON.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.default.value "active"\n' +
        'status: string\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        name: 'value',
        type: 'string',
        description:
          'Static default value. Strings used as-is; other types parsed via JSON.parse().',
      },
    }),

    fn: new AnnotationSpec({
      description:
        'Sets a DB-level generated default. The function name is portable — ' +
        'each adapter maps it to the appropriate DB mechanism.' +
        '\n\n**Example:**\n' +
        '```atscript\n' +
        '@db.default.fn "increment"\n' +
        'id: number\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        name: 'fn',
        type: 'string',
        values: ['increment', 'uuid', 'now'],
        description: 'Generation function name: "increment", "uuid", or "now".',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        if (!args[0]) {
          return errors
        }
        const fnName = args[0].text
        const validFns = ['increment', 'uuid', 'now']
        if (!validFns.includes(fnName)) {
          errors.push({
            message: `Unknown @db.default.fn "${fnName}" — expected "increment", "uuid", or "now"`,
            severity: 1,
            range: args[0].range,
          })
          return errors
        }

        // Validate type compatibility
        const field = token.parentNode!
        const definition = field.getDefinition()
        if (!definition || !isRef(definition)) {
          return errors
        }
        const unwound = doc.unwindType(definition.id!, definition.chain)
        if (!unwound || !isPrimitive(unwound.def)) {
          return errors
        }
        const baseType = unwound.def.config.type as string

        if (fnName === 'increment' && baseType !== 'number') {
          errors.push({
            message: `@db.default.fn "increment" is not compatible with type "${baseType}" — requires number`,
            severity: 1,
            range: token.range,
          })
        } else if (fnName === 'uuid' && baseType !== 'string') {
          errors.push({
            message: `@db.default.fn "uuid" is not compatible with type "${baseType}" — requires string`,
            severity: 1,
            range: token.range,
          })
        } else if (fnName === 'now' && !['number', 'string'].includes(baseType)) {
          errors.push({
            message: `@db.default.fn "now" is not compatible with type "${baseType}" — requires number or string`,
            severity: 1,
            range: token.range,
          })
        }

        return errors
      },
    }),
  },

  json: new AnnotationSpec({
    description:
      'Forces a field to be stored as a single JSON column instead of being flattened ' +
      'into separate columns. Use on nested object fields that should remain as JSON ' +
      'in the database.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.json\n' +
      'metadata: { key: string, value: string }\n' +
      '```\n',
    nodeType: ['prop'],
    validate(token, _args, doc) {
      const errors = [] as TMessages
      const field = token.parentNode!
      const definition = field.getDefinition()

      // J1: warning on primitive types
      if (definition && isRef(definition)) {
        const unwound = doc.unwindType(definition.id!, definition.chain)
        if (unwound && isPrimitive(unwound.def)) {
          errors.push({
            message:
              '@db.json on a primitive field has no effect — primitive fields are already stored as scalar columns',
            severity: 2,
            range: token.range,
          })
        }
      }

      return errors
    },
  }),

  ignore: new AnnotationSpec({
    description:
      'Excludes a field from the database schema. The field exists in the Atscript type ' +
      'but has no column in the DB.' +
      '\n\n**Example:**\n' +
      '```atscript\n' +
      '@db.ignore\n' +
      'displayName: string\n' +
      '```\n',
    nodeType: ['prop'],
    validate(token, args, doc) {
      const errors = [] as TMessages
      const field = token.parentNode!
      if (field.countAnnotations('meta.id') > 0) {
        errors.push({
          message: `@db.ignore cannot coexist with @meta.id — a field cannot be both a primary key and excluded from the database`,
          severity: 1,
          range: token.range,
        })
      }
      return errors
    },
  }),

  rel: {
    FK: new AnnotationSpec({
      description:
        'Declares a foreign key constraint on this field. The field must use a chain ' +
        'reference type (e.g., `User.id`) to specify the FK target.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.rel.FK\n' +
        'authorId: User.id\n' +
        '\n' +
        '// With alias (required when multiple FKs point to the same type)\n' +
        '@db.rel.FK "author"\n' +
        'authorId: User.id\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        optional: true,
        name: 'alias',
        type: 'string',
        description: 'Alias for pairing with @db.rel.to. Required when multiple FKs point to the same target type.',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const field = token.parentNode!
        const alias = args[0]?.text

        // F1: Must be on a @db.table interface
        const owner = getDbTableOwner(token)
        if (!owner || owner.countAnnotations('db.table') === 0) {
          errors.push({
            message: '@db.rel.FK is only valid on fields of a @db.table interface',
            severity: 1,
            range: token.range,
          })
        }

        // F6: Cannot coexist with @db.rel.to or @db.rel.from
        if (field.countAnnotations('db.rel.to') > 0 || field.countAnnotations('db.rel.from') > 0) {
          errors.push({
            message: 'A field cannot be both a foreign key and a navigational property',
            severity: 1,
            range: token.range,
          })
        }

        // F2: Field type must be a chain reference
        const definition = field.getDefinition()
        if (!definition || !isRef(definition) || !(definition as SemanticRefNode).hasChain) {
          errors.push({
            message: `@db.rel.FK requires a chain reference type (e.g. User.id), got scalar type`,
            severity: 1,
            range: token.range,
          })
          return errors
        }

        const ref = definition as SemanticRefNode
        const refTypeName = ref.id!
        const chainFields = ref.chain.map(c => c.text)

        // X2: FK target field must be @meta.id or @db.index.unique
        // F3: FK must resolve to a scalar type
        const targetUnwound = doc.unwindType(refTypeName)
        if (targetUnwound) {
          const targetDef = targetUnwound.def
          if (isInterface(targetDef) || isStructure(targetDef)) {
            const struct = isInterface(targetDef)
              ? targetDef.getDefinition() as SemanticStructureNode | undefined
              : targetDef
            if (struct && isStructure(struct) && chainFields.length > 0) {
              const targetProp = struct.props.get(chainFields[0])
              if (targetProp) {
                // X2: Check that target field is @meta.id or @db.index.unique
                if (targetProp.countAnnotations('meta.id') === 0 && targetProp.countAnnotations('db.index.unique') === 0) {
                  errors.push({
                    message: `@db.rel.FK target '${refTypeName}.${chainFields.join('.')}' is not a primary key (@meta.id) or unique (@db.index.unique) field`,
                    severity: 1,
                    range: token.range,
                  })
                }

                // F3: Check that FK resolves to a scalar type
                const propDef = targetProp.getDefinition()
                if (propDef && isRef(propDef)) {
                  const propUnwound = targetUnwound.doc.unwindType(propDef.id!, propDef.chain)
                  if (propUnwound && !isPrimitive(propUnwound.def)) {
                    errors.push({
                      message: `Foreign key field must resolve to a scalar type (number, string, etc.), got '${propDef.id}'`,
                      severity: 1,
                      range: token.range,
                    })
                  }
                } else if (propDef && !isPrimitive(propDef)) {
                  errors.push({
                    message: `Foreign key field must resolve to a scalar type (number, string, etc.)`,
                    severity: 1,
                    range: token.range,
                  })
                }
              }
            }
          }
        }

        // F4: Multiple unaliased FKs to same target type
        if (!alias) {
          const struct = getParentStruct(token)
          if (struct) {
            let sameTargetCount = 0
            for (const [, prop] of struct.props) {
              if (prop.countAnnotations('db.rel.FK') === 0) continue
              const def = prop.getDefinition()
              if (!def || !isRef(def)) continue
              const r = def as SemanticRefNode
              if (!r.hasChain) continue
              if (r.id === refTypeName) {
                // Check if this FK also has no alias
                const fkAnnotations = prop.annotations?.filter(a => a.name === 'db.rel.FK')
                const hasAlias = fkAnnotations?.some(a => a.args.length > 0)
                if (!hasAlias) sameTargetCount++
              }
            }
            if (sameTargetCount > 1) {
              errors.push({
                message: `Multiple @db.rel.FK fields resolve to type '${refTypeName}' — add alias to disambiguate`,
                severity: 1,
                range: token.range,
              })
            }
          }
        }

        return errors
      },
    }),

    to: new AnnotationSpec({
      description:
        'Forward navigational property — the FK is on **this** interface. ' +
        'The compiler resolves the matching @db.rel.FK by target type or alias.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.rel.to\n' +
        'author?: User\n' +
        '\n' +
        '// With alias\n' +
        '@db.rel.to "author"\n' +
        'author?: User\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        optional: true,
        name: 'alias',
        type: 'string',
        description: 'Match a local @db.rel.FK by alias.',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const field = token.parentNode!
        const alias = args[0]?.text

        // T2: Must be on a @db.table interface
        const owner = getDbTableOwner(token)
        if (!owner || owner.countAnnotations('db.table') === 0) {
          errors.push({
            message: '@db.rel.to is only valid on fields of a @db.table interface',
            severity: 1,
            range: token.range,
          })
        }

        // F6: Cannot coexist with @db.rel.FK
        if (field.countAnnotations('db.rel.FK') > 0) {
          errors.push({
            message: 'A field cannot be both a foreign key and a navigational property',
            severity: 1,
            range: token.range,
          })
        }

        const targetTypeName = getNavTargetTypeName(field)
        if (!targetTypeName) {
          return errors
        }

        // T1: Target type must have @db.table
        const unwound = doc.unwindType(targetTypeName)
        if (unwound) {
          const targetDef = unwound.def
          const targetNode = (isInterface(targetDef)) ? targetDef : undefined
          if (!targetNode || targetNode.countAnnotations('db.table') === 0) {
            errors.push({
              message: `@db.rel.to target '${targetTypeName}' is not a @db.table entity`,
              severity: 1,
              range: token.range,
            })
          }
        }

        // T7: .to type must not be a union type
        const fieldDef = field.getDefinition()
        if (fieldDef && fieldDef.entity === 'group' && (fieldDef as any).op === '|') {
          errors.push({
            message: '@db.rel.to does not support union types — use separate relations',
            severity: 1,
            range: token.range,
          })
        }

        // T3/T4/T5/T6: Find matching FK on this interface
        const struct = getParentStruct(token)
        if (struct) {
          // T6: Duplicate .to with same alias/target
          const fieldName = field.id
          for (const [name, prop] of struct.props) {
            if (name === fieldName) continue
            if (prop.countAnnotations('db.rel.to') === 0) continue
            const propAlias = getAnnotationAlias(prop, 'db.rel.to')
            if ((alias || undefined) === (propAlias || undefined)) {
              const otherTarget = getNavTargetTypeName(prop)
              if (otherTarget === targetTypeName) {
                errors.push({
                  message: `Duplicate @db.rel.to '${alias || targetTypeName}' — only one forward navigational property per alias`,
                  severity: 1,
                  range: token.range,
                })
                break
              }
            }
          }

          if (alias) {
            // T5: Aliased — must find FK with matching alias
            const matches = findFKFieldsPointingTo(doc, struct, targetTypeName, alias)
            if (matches.length === 0) {
              errors.push({
                message: `No @db.rel.FK '${alias}' found on this interface`,
                severity: 1,
                range: token.range,
              })
            }
          } else {
            // T3/T4: Unaliased — find single FK pointing to target type
            const matches = findFKFieldsPointingTo(doc, struct, targetTypeName)
            if (matches.length === 0) {
              errors.push({
                message: `No @db.rel.FK on this interface points to '${targetTypeName}' — did you mean @db.rel.from?`,
                severity: 1,
                range: token.range,
              })
            } else if (matches.length > 1) {
              errors.push({
                message: `Multiple @db.rel.FK fields point to '${targetTypeName}' — add alias to disambiguate`,
                severity: 1,
                range: token.range,
              })
            }
          }
        }

        return errors
      },
    }),

    from: new AnnotationSpec({
      description:
        'Inverse navigational property — the FK is on the **target** interface, pointing back to this one.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.rel.from\n' +
        'posts: Post[]\n' +
        '\n' +
        '// With alias\n' +
        '@db.rel.from "original"\n' +
        'comments: Comment[]\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        optional: true,
        name: 'alias',
        type: 'string',
        description: 'Match a @db.rel.FK on the target interface by alias.',
      },
      validate(token, args, doc) {
        const errors = [] as TMessages
        const field = token.parentNode!
        const alias = args[0]?.text

        // R2: Must be on a @db.table interface
        const owner = getDbTableOwner(token)
        if (!owner || owner.countAnnotations('db.table') === 0) {
          errors.push({
            message: '@db.rel.from is only valid on fields of a @db.table interface',
            severity: 1,
            range: token.range,
          })
        }

        // F6: Cannot coexist with @db.rel.FK
        if (field.countAnnotations('db.rel.FK') > 0) {
          errors.push({
            message: 'A field cannot be both a foreign key and a navigational property',
            severity: 1,
            range: token.range,
          })
        }

        const targetTypeName = getNavTargetTypeName(field)
        if (!targetTypeName) {
          return errors
        }

        // R1: Target type must have @db.table
        const unwound = doc.unwindType(targetTypeName)
        if (!unwound) {
          return errors
        }
        const targetDef = unwound.def
        const targetDoc = unwound.doc
        if (!isInterface(targetDef) || targetDef.countAnnotations('db.table') === 0) {
          errors.push({
            message: `@db.rel.from target '${targetTypeName}' is not a @db.table entity`,
            severity: 1,
            range: token.range,
          })
          return errors
        }

        // R6: Duplicate .from with same alias/target
        const struct = getParentStruct(token)
        if (struct) {
          const fieldName = field.id
          for (const [name, prop] of struct.props) {
            if (name === fieldName) continue
            if (prop.countAnnotations('db.rel.from') === 0) continue
            const propAlias = getAnnotationAlias(prop, 'db.rel.from')
            if ((alias || undefined) === (propAlias || undefined)) {
              const otherTarget = getNavTargetTypeName(prop)
              if (otherTarget === targetTypeName) {
                errors.push({
                  message: `Duplicate @db.rel.from '${alias || targetTypeName}' — only one inverse navigational property per alias`,
                  severity: 1,
                  range: token.range,
                })
                break
              }
            }
          }
        }

        // R3/R4/R5: Find matching FK on the target type pointing back to this type
        const thisTypeName = getParentTypeName(token)
        if (!thisTypeName) {
          return errors
        }

        const matches = findFKFieldsPointingTo(targetDoc, targetDef, thisTypeName, alias)
        if (alias) {
          // R5: Aliased — must find FK with matching alias on target
          if (matches.length === 0) {
            errors.push({
              message: `No @db.rel.FK '${alias}' found on '${targetTypeName}'`,
              severity: 1,
              range: token.range,
            })
          }
        } else {
          // R3/R4: Unaliased — find single FK on target pointing back
          if (matches.length === 0) {
            errors.push({
              message: `No @db.rel.FK on '${targetTypeName}' points to '${thisTypeName}'`,
              severity: 1,
              range: token.range,
            })
          } else if (matches.length > 1) {
            errors.push({
              message: `'${targetTypeName}' has multiple @db.rel.FK fields pointing to '${thisTypeName}' — add alias`,
              severity: 1,
              range: token.range,
            })
          }
        }

        // R7: Singular (non-array) from but FK on target not unique
        const fieldDef = field.getDefinition()
        if (!isArray(fieldDef) && matches.length === 1) {
          const fkProp = matches[0].prop
          if (fkProp.countAnnotations('db.index.unique') === 0) {
            errors.push({
              message: `@db.rel.from '${field.id}' has singular type '${targetTypeName}' (1:1) but the FK on '${targetTypeName}' is not @db.index.unique — did you mean '${targetTypeName}[]' (1:N)?`,
              severity: 2,
              range: token.range,
            })
          }
        }

        return errors
      },
    }),

    onDelete: refActionAnnotation('onDelete'),
    onUpdate: refActionAnnotation('onUpdate'),
  },
}
