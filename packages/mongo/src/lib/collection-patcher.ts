// oxlint-disable max-depth
import {
  isAnnotatedTypeOfPrimitive,
  TAtscriptAnnotatedType,
  TAtscriptAnnotatedTypeConstructor,
  TAtscriptTypeArray,
  defineAnnotatedType as $,
  TAtscriptTypeObject,
  Validator,
} from '@atscript/typescript'
import { AsCollection } from './as-collection'
import {
  AddToSetOperators,
  Filter,
  MatchKeysAndValues,
  PullOperator,
  PushOperator,
  UpdateFilter,
  UpdateOptions,
} from 'mongodb'

export class CollectionPatcher<T extends TAtscriptAnnotatedTypeConstructor> {
  constructor(
    private collection: AsCollection<T>,
    private payload: any
  ) {}

  static getKeyProps(def: TAtscriptAnnotatedType<TAtscriptTypeArray>) {
    if (def.type.of.type.kind === 'object') {
      const objType = def.type.of.type
      const keyProps = new Set<string>()
      for (const [key, val] of objType.props.entries()) {
        if (val.metadata.get('meta.isKey')) {
          keyProps.add(key)
        }
      }
      return keyProps
    }
    return new Set<string>()
  }

  static prepareValidator<T extends TAtscriptAnnotatedTypeConstructor>(
    collection: AsCollection<T>
  ): Validator<T> {
    return collection.type.validator({
      replace: (def, path) => {
        if (
          def.type.kind === 'array' &&
          // @ts-expect-error
          collection.flatMap.get(path)?.metadata.get('mongo.__topLevelArray') && // only patching top level arrays
          // @ts-expect-error
          !def.metadata.has('mongo.__patchArrayValue')
        ) {
          const defArray = def as TAtscriptAnnotatedType<TAtscriptTypeArray>
          const mergeStrategy = defArray.metadata.get('mongo.patch.strategy') === 'merge'
          function getPatchType() {
            const isPrimitive = isAnnotatedTypeOfPrimitive(defArray.type.of)
            if (isPrimitive) {
              return (
                $()
                  .refTo(def)
                  .copyMetadata(def.metadata)
                  // @ts-expect-error
                  .annotate('mongo.__patchArrayValue')
                  .optional().$type
              )
            }
            if (defArray.type.of.type.kind === 'object') {
              const objType = defArray.type.of.type
              const t = $('object').copyMetadata(defArray.type.of.metadata)
              const keyProps = CollectionPatcher.getKeyProps(defArray)
              for (const [key, val] of objType.props.entries()) {
                if (keyProps.size) {
                  if (keyProps.has(key)) {
                    t.prop(key, $().refTo(val).copyMetadata(def.metadata).$type)
                  } else {
                    t.prop(key, $().refTo(val).copyMetadata(def.metadata).optional().$type)
                  }
                } else {
                  t.prop(
                    key,
                    $().refTo(val).copyMetadata(def.metadata).optional(!!val.optional).$type
                  )
                }
              }
              return (
                $('array')
                  .of(t.$type)
                  .copyMetadata(def.metadata)
                  // @ts-expect-error
                  .annotate('mongo.__patchArrayValue')
                  .optional().$type
              )
            }
            return undefined
          }
          const fullType = $()
            .refTo(def)
            .copyMetadata(def.metadata)
            // @ts-expect-error
            .annotate('mongo.__patchArrayValue')
            .optional().$type
          const patchType = getPatchType()
          return patchType
            ? $('object')
                .prop('$replace', fullType)
                .prop('$append', fullType)
                .prop('$merge', mergeStrategy ? patchType : fullType)
                .prop('$remove', patchType)
                .optional().$type
            : $('object').prop('$replace', fullType).prop('$append', fullType).optional().$type
        }
        return def
      },
      partial: (def, path) => {
        return path === '' || def.metadata.get('mongo.patch.strategy') === 'merge'
      },
    })
  }

  private filterObj = {} as Filter<InstanceType<T>>
  private updateObj = {} as UpdateFilter<InstanceType<T>>
  private optionsObj = {} as UpdateOptions

  public preparePatch() {
    this.filterObj = {
      _id: this.collection.prepareId(this.payload._id),
    }
    this.flattenPayload(this.payload)
    return {
      toArgs: (): [Filter<InstanceType<T>>, UpdateFilter<InstanceType<T>>, UpdateOptions] => [
        this.filterObj,
        this.updateObj,
        this.optionsObj,
      ],
      filter: this.filterObj,
      updateFilter: this.updateObj,
      updateOptions: this.optionsObj,
    }
  }

  private arrayKeyCounter = 0

  private flattenPayload(payload: T, prefix = ''): UpdateFilter<InstanceType<T>> {
    const evalKey = (k: string) => (prefix ? `${prefix}.${k}` : k) as string
    const _set = (key: string, val: any) => {
      if (!this.updateObj.$set) {
        this.updateObj.$set = {} as MatchKeysAndValues<InstanceType<T>>
      }
      this.updateObj.$set[key as keyof MatchKeysAndValues<InstanceType<T>>] = val
    }
    const _append = (op: '$push' | '$addToSet', key: string, val: any[]) => {
      if (!this.updateObj[op]) {
        this.updateObj[op] = {}
      }
      this.updateObj[op][
        key as keyof PushOperator<InstanceType<T>> & keyof AddToSetOperators<InstanceType<T>>
      ] = {
        $each: val,
      }
    }
    const _remove = (key: string, val: any[]) => {
      if (!this.updateObj.$pullAll) {
        this.updateObj.$pullAll = {}
      }
      // @ts-expect-error
      this.updateObj.$pullAll[key] = val
    }
    for (const [_key, value] of Object.entries(payload)) {
      const key = evalKey(_key)
      const flatType = this.collection.flatMap.get(key)
      // @ts-expect-error
      const topLevelArray = flatType?.metadata?.get('mongo.__topLevelArray') as boolean | undefined
      if (typeof value === 'object' && topLevelArray) {
        const toReplace = value.$replace as any[] | undefined
        const toAppend = value.$append as any[] | undefined
        const toRemove = value.$remove as any[] | undefined
        const toMerge = value.$merge as any[] | undefined
        if ((toReplace && toAppend) || (toReplace && toRemove) || (toReplace && toMerge)) {
          throw new Error(
            `[mongo] "${key}" When $replace is used, $append, $remove and $merge cannot be used at the same time`
          )
        }
        if (toReplace) {
          _set(key, toReplace)
        } else {
          if (toAppend?.length) {
            _append('$push', key, toAppend)
          }
          const keyProps =
            flatType?.type.kind === 'array'
              ? CollectionPatcher.getKeyProps(
                  flatType as TAtscriptAnnotatedType<TAtscriptTypeArray>
                )
              : new Set<string>()
          if (toMerge?.length) {
            if (keyProps.size) {
              const mergeStrategy =
                this.collection.flatMap.get(key)?.metadata?.get('mongo.patch.strategy') === 'merge'
              for (const item of toMerge) {
                const itemWithoutKeys = {} as Record<string, any>
                for (const [_key, _val] of Object.entries(item)) {
                  if (!keyProps.has(_key)) {
                    itemWithoutKeys[_key] = _val
                  }
                }
                const k = `a${this.arrayKeyCounter++}`
                const arrayKey = `${key}.$[${k}]`
                if (mergeStrategy) {
                  this.flattenPayload(itemWithoutKeys as T, arrayKey)
                } else {
                  _set(arrayKey, item)
                }
                const keys = {} as Record<string, any>
                for (const keyName of keyProps) {
                  keys[`${k}.${keyName}`] = item[keyName]
                }
                this.optionsObj.arrayFilters = this.optionsObj.arrayFilters || []
                this.optionsObj.arrayFilters.push(keys)
              }
            } else {
              _append('$addToSet', key, toMerge)
            }
          }
          if (toRemove?.length) {
            if (keyProps.size) {
              if (!this.updateObj.$pull) {
                this.updateObj.$pull = {}
              }
              const keysToRemove = [] as any[]
              for (const item of toRemove) {
                const keys = {} as Record<string, any>
                for (const keyName of keyProps) {
                  keys[`${keyName}`] = item[keyName]
                }
                keysToRemove.push(keys)
              }
              this.updateObj.$pull[key as keyof PullOperator<InstanceType<T>>] = {
                $or: keysToRemove,
              }
            } else {
              _remove(key, toRemove)
            }
          }
        }
      } else if (
        typeof value === 'object' &&
        this.collection.flatMap.get(key)?.metadata?.get('mongo.patch.strategy') === 'merge'
      ) {
        this.flattenPayload(value, key)
      } else {
        _set(key, value)
      }
    }
    return this.updateObj
  }
}
