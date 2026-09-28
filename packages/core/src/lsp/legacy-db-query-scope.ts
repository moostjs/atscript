/**
 * @deprecated Built-in editor scopes for the `@db.view.filter`, `@db.view.joins` and
 * `@db.rel.filter` query arguments. They are a fallback for DB plugin versions whose
 * argument specs do not declare a `fieldScope` hook yet — the DB plugin owns these
 * rules now. Scheduled for removal in `@atscript/core` 0.2.0 (next minor).
 */
import type { TQueryScope } from '../annotations/annotation-spec'
import { isArray, isRef, type SemanticNode } from '../parser/nodes'
import type { Token } from '../parser/token'

/**
 * @deprecated Query scope of a built-in `@db.*` query argument (see the module note);
 * `undefined` for any other annotation.
 */
export function getLegacyDbQueryScope(queryArgToken: Token): TQueryScope | undefined {
  const owner = queryArgToken.parentNode
  if (!owner) {
    return undefined
  }
  switch (queryArgToken.annotationRef?.text.slice(1)) {
    case 'db.view.filter': {
      return getViewFilterScope(owner)
    }
    case 'db.view.joins': {
      return getViewJoinsScope(owner, queryArgToken)
    }
    case 'db.rel.filter': {
      return getRelFilterScope(owner)
    }
    default: {
      return undefined
    }
  }
}

function getViewFilterScope(owner: SemanticNode): TQueryScope | undefined {
  const forAnnotations = owner.annotations?.filter(a => a.name === 'db.view.for')
  const entryTypeName = forAnnotations?.[0]?.args[0]?.text
  if (!entryTypeName) {
    return undefined
  }

  const allowedTypes = [entryTypeName]
  const joinsAnnotations = owner.annotations?.filter(a => a.name === 'db.view.joins')
  if (joinsAnnotations) {
    for (const join of joinsAnnotations) {
      if (join.args[0]) {
        allowedTypes.push(join.args[0].text)
      }
    }
  }

  return { allowedTypes, unqualifiedTarget: entryTypeName }
}

function getViewJoinsScope(owner: SemanticNode, queryArgToken: Token): TQueryScope | undefined {
  const forAnnotations = owner.annotations?.filter(a => a.name === 'db.view.for')
  const entryTypeName = forAnnotations?.[0]?.args[0]?.text
  if (!entryTypeName) {
    return undefined
  }

  // Find the join target from the same annotation instance
  // The queryArgToken is arg[1] (condition), arg[0] is the join target ref
  const joinsAnnotation = owner.annotations?.find(
    a => a.name === 'db.view.joins' && a.args.includes(queryArgToken)
  )
  const joinTargetName = joinsAnnotation?.args[0]?.text
  if (!joinTargetName) {
    return undefined
  }

  return { allowedTypes: [joinTargetName, entryTypeName], unqualifiedTarget: entryTypeName }
}

function getRelFilterScope(owner: SemanticNode): TQueryScope | undefined {
  // owner is a prop node with @db.rel.to/@db.rel.from/@db.rel.via
  let def = owner.getDefinition()
  if (isArray(def)) {
    def = def?.getDefinition()
  }
  if (!isRef(def)) {
    return undefined
  }

  const targetTypeName = def.id!
  const allowedTypes = [targetTypeName]

  // For @db.rel.via, also allow junction type
  const viaAnnotation = owner.annotations?.find(a => a.name === 'db.rel.via')
  if (viaAnnotation?.args[0]) {
    allowedTypes.push(viaAnnotation.args[0].text)
  }

  return { allowedTypes, unqualifiedTarget: targetTypeName }
}
