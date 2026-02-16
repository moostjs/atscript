// oxlint-disable max-lines
// oxlint-disable max-depth
import {
  isAnnotatedTypeOfPrimitive,
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  defineAnnotatedType as $,
} from '@atscript/typescript/utils'
import { AsCollection } from './as-collection'
import { type Document, type Filter, type UpdateFilter, type UpdateOptions } from 'mongodb'
import { validateMongoIdPlugin, validateMongoUniqueArrayItemsPlugin } from './validate-plugins'

/**
 * CollectionPatcher is a small helper that converts a *patch payload* produced
 * by Atscript into a shape that the official MongoDB driver understands – a
 * triple of `(filter, update, options)` to be fed to `collection.updateOne()`.
 *
 * Supported high‑level operations for *top‑level arrays* (see the attached
 * spreadsheet in the chat):
 *
 * | Payload field | MongoDB operator        | Purpose                                |
 * |-------------- |-------------------------|----------------------------------------|
 * | `$replace`    | full `$set`             | Replace the whole array.               |
 * | `$insert`     | `$push`                 | Append new items (duplicates allowed). |
 * | `$upsert`     | custom                  | Insert or update by *key* (see TODO).  |
 * | `$update`     | `$set` + `arrayFilters` | Update array elements matched by *key* |
 * | `$remove`     | `$pullAll` / `$pull`    | Remove by value or by *key*.           |
 *
 * The class walks through the incoming payload, detects which of the above
 * operations applies to each top‑level array and builds the corresponding
 * MongoDB update document. Primitive fields are flattened into a regular
 * `$set` map.
 */
export class CollectionPatcher<T extends TAtscriptAnnotatedType = TAtscriptAnnotatedType, DataType = T extends { type: { __dataType?: infer D } } ? unknown extends D ? T extends new (...args: any[]) => infer I ? I : unknown : D : unknown> {
  constructor(
    private collection: AsCollection<T>,
    private payload: any
  ) {}

  /**
   * Extract a set of *key properties* (annotated with `@meta.isKey`) from an
   * array‐of‐objects type definition. These keys uniquely identify an element
   * inside the array and are later used for `$update`, `$remove` and `$upsert`.
   *
   * @param def Atscript array type
   * @returns Set of property names marked as keys; empty set if none
   */
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

  /**
   * Build a runtime *Validator* that understands the extended patch payload.
   *
   *  * Adds per‑array *patch* wrappers (the `$replace`, `$insert`, … fields).
   *  * Honors `mongo.patch.strategy === "merge"` metadata.
   *
   * @param collection Target collection wrapper
   * @returns Atscript Validator
   */
  static prepareValidator<T extends TAtscriptAnnotatedType>(
    collection: AsCollection<T, any>
  ) {
    return collection.createValidator({
      plugins: [validateMongoIdPlugin, validateMongoUniqueArrayItemsPlugin],
      replace: (def, path) => {
        if (path === '' && def.type.kind === 'object') {
          const obj = $('object').copyMetadata(def.metadata)
          for (const [prop, type] of def.type.props.entries()) {
            obj.prop(
              prop,
              $()
                .refTo(type)
                .copyMetadata(type.metadata)
                .optional(prop !== '_id').$type
            )
          }
          return obj.$type
        }
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
                .prop('$insert', fullType)
                .prop('$upsert', fullType)
                .prop('$update', mergeStrategy ? patchType : fullType)
                .prop('$remove', patchType)
                .optional().$type
            : $('object').prop('$replace', fullType).prop('$insert', fullType).optional().$type
        }
        return def
      },
      partial: (def, path) => path !== '' && def.metadata.get('mongo.patch.strategy') === 'merge',
    })
  }

  /**
   * Internal accumulator: filter passed to `updateOne()`.
   * Filled only with the `_id` field right now.
   */
  private filterObj = {} as Filter<any>

  /** MongoDB *update* document being built. */
  private updatePipeline = [] as Document[]

  /** Additional *options* (mainly `arrayFilters`). */
  private optionsObj = {} as UpdateOptions

  /**
   * Entry point – walk the payload, build `filter`, `update` and `options`.
   *
   * @returns Helper object exposing both individual parts and
   *          a `.toArgs()` convenience callback.
   */
  public preparePatch() {
    this.filterObj = {
      _id: this.collection.prepareId(this.payload._id),
    }
    this.flattenPayload(this.payload)
    let updateFilter = this.updatePipeline
    return {
      toArgs: (): [
        Filter<any>,
        UpdateFilter<any> | Document[],
        UpdateOptions,
      ] => [this.filterObj, updateFilter, this.optionsObj],
      filter: this.filterObj,
      updateFilter: updateFilter,
      updateOptions: this.optionsObj,
    }
  }

  // ---------------------------------------------------------------------------
  //  Internals
  // ---------------------------------------------------------------------------

  /**
   * Helper – lazily create `$set` section and assign *key* → *value*.
   *
   * @param key Fully‑qualified dotted path
   * @param val Value to be written
   * @private
   */
  private _set(key: string, val: any) {
    for (const pipe of this.updatePipeline) {
      if (!pipe.$set) {
        pipe.$set = {}
      }
      if (!pipe.$set[key]) {
        pipe.$set[key] = val
        return
      }
    }
    this.updatePipeline.push({
      $set: {
        [key]: val,
      },
    })
  }

  /**
   * Recursively walk through the patch *payload* and convert it into `$set`/…
   * statements. Top‑level arrays are delegated to {@link parseArrayPatch}.
   *
   * @param payload Current payload chunk
   * @param prefix  Dotted path accumulated so far
   * @private
   */
  private flattenPayload(payload: any, prefix = ''): UpdateFilter<any> {
    const evalKey = (k: string) => (prefix ? `${prefix}.${k}` : k) as string
    for (const [_key, value] of Object.entries(payload)) {
      const key = evalKey(_key)
      const flatType = this.collection.flatMap.get(key)
      // @ts-expect-error
      const topLevelArray = flatType?.metadata?.get('mongo.__topLevelArray') as boolean | undefined
      if (typeof value === 'object' && topLevelArray) {
        this.parseArrayPatch(key, value)
      } else if (
        typeof value === 'object' &&
        this.collection.flatMap.get(key)?.metadata?.get('mongo.patch.strategy') === 'merge'
      ) {
        this.flattenPayload(value, key)
      } else if (key !== '_id') {
        this._set(key, value)
      }
    }
    return this.updatePipeline
  }

  /**
   * Dispatch a *single* array patch. Exactly one of `$replace`, `$insert`,
   * `$upsert`, `$update`, `$remove` must be present – otherwise we throw.
   *
   * @param key   Dotted path to the array field
   * @param value Payload slice for that field
   * @private
   */
  private parseArrayPatch(key: string, value: any) {
    const flatType = this.collection.flatMap.get(key)
    const toRemove = value.$remove as any[] | undefined
    const toReplace = value.$replace as any[] | undefined
    const toInsert = value.$insert as any[] | undefined
    const toUpsert = value.$upsert as any[] | undefined
    const toUpdate = value.$update as any[] | undefined

    const keyProps =
      flatType?.type.kind === 'array'
        ? CollectionPatcher.getKeyProps(flatType as TAtscriptAnnotatedType<TAtscriptTypeArray>)
        : new Set<string>()

    this._remove(key, toRemove, keyProps)
    this._replace(key, toReplace)
    this._insert(key, toInsert, keyProps)
    this._upsert(key, toUpsert, keyProps)
    this._update(key, toUpdate, keyProps)
  }

  /**
   * Build an *aggregation‐expression* that checks equality by **all** keys in
   * `keys`.  Example output for keys `["id", "lang"]` and bases `a`, `b`:
   * ```json
   * { "$and": [ { "$eq": ["$$a.id", "$$b.id"] }, { "$eq": ["$$a.lang", "$$b.lang"] } ] }
   * ```
   *
   * @param keys  Ordered list of key property names
   * @param left  Base token for *left* expression (e.g. `"$$el"`)
   * @param right Base token for *right* expression (e.g. `"$$this"`)
   */
  private _keysEqual(keys: string[], left: string, right: string): any {
    return (
      keys
        .map(k => ({ $eq: [`${left}.${k}`, `${right}.${k}`] }))
        // @ts-expect-error
        .reduce((acc, cur) => (acc ? { $and: [acc, cur] } : cur))
    )
  }

  // ---------------------------------------------------------------------------
  //  Individual MongoDB operators – each method adds a chunk to `updateObj`.
  // ---------------------------------------------------------------------------

  /**
   * `$replace` – overwrite the entire array with `input`.
   *
   * @param key   Dotted path to the array
   * @param input New array value (may be `undefined`)
   * @private
   */
  private _replace(key: string, input: any[] | undefined) {
    if (input) {
      this._set(key, input)
    }
  }

  /**
   * `$insert`
   * - plain append      → $concatArrays
   * - unique / keyed    → delegate to _upsert (insert-or-update)
   */
  private _insert(key: string, input: any[] | undefined, keyProps: Set<string>) {
    if (!input?.length) {
      return
    }

    const uniqueItems = this.collection.flatMap.get(key)?.metadata?.has('mongo.array.uniqueItems')

    if (uniqueItems || keyProps.size > 0) {
      this._upsert(key, input, keyProps)
    } else {
      // classic `$push ... $each`  →  $concatArrays
      this._set(key, {
        $concatArrays: [
          { $ifNull: [`$${key}`, []] },
          input, // literal items
        ],
      })
    }
  }

  /**
   * `$upsert`
   * - keyed  → remove existing matching by key(s) then append candidate
   * - unique → $setUnion (deep equality)
   */
  private _upsert(key: string, input: any[] | undefined, keyProps: Set<string>) {
    if (!input?.length) {
      return
    }

    // ── keyed upsert ──────────────────────────────────────────────────────────
    if (keyProps.size) {
      const keys = [...keyProps]
      this._set(key, {
        $reduce: {
          input, // literal payload
          initialValue: { $ifNull: [`$${key}`, []] },
          in: {
            $let: {
              vars: { acc: '$$value', cand: '$$this' },
              in: {
                $concatArrays: [
                  {
                    $filter: {
                      input: '$$acc',
                      as: 'el',
                      cond: { $not: this._keysEqual(keys, '$$el', '$$cand') },
                    },
                  },
                  ['$$cand'],
                ],
              },
            },
          },
        },
      })
      return
    }

    // ── no key → behave like $addToSet (deep equality) ────────────
    this._set(key, {
      $setUnion: [{ $ifNull: [`$${key}`, []] }, input],
    })
  }

  /**
   * `$update`
   * - keyed       → map array and merge / replace matching element(s)
   * - non-keyed   → behave like `$addToSet` (insert only when not present)
   */
  private _update(key: string, input: any[] | undefined, keyProps: Set<string>) {
    if (!input?.length) {
      return
    }

    if (keyProps.size) {
      const mergeStrategy =
        this.collection.flatMap.get(key)?.metadata?.get('mongo.patch.strategy') === 'merge'

      const keys = [...keyProps]
      // sequentially apply each patch item
      this._set(key, {
        $reduce: {
          input,
          initialValue: { $ifNull: [`$${key}`, []] },
          in: {
            $map: {
              input: '$$value',
              as: 'el',
              in: {
                $cond: [
                  this._keysEqual(keys, '$$el', '$$this'),
                  mergeStrategy
                    ? { $mergeObjects: ['$$el', '$$this'] } // merge
                    : '$$this', // replace
                  '$$el',
                ],
              },
            },
          },
        },
      })
    } else {
      // non-keyed “update” means insert-if-missing
      this._set(key, {
        $setUnion: [{ $ifNull: [`$${key}`, []] }, input],
      })
    }
  }

  /**
   * `$remove`
   * - keyed     → filter out any element whose key set matches a payload item
   * - non-keyed → deep equality remove (`$setDifference`)
   */
  private _remove(key: string, input: any[] | undefined, keyProps: Set<string>) {
    if (!input?.length) {
      return
    }

    if (keyProps.size) {
      const keys = [...keyProps]
      this._set(key, {
        $let: {
          vars: { rem: input },
          in: {
            $filter: {
              input: { $ifNull: [`$${key}`, []] },
              as: 'el',
              cond: {
                $not: {
                  $anyElementTrue: {
                    $map: {
                      input: '$$rem',
                      as: 'r',
                      in: this._keysEqual(keys, '$$el', '$$r'),
                    },
                  },
                },
              },
            },
          },
        },
      })
    } else {
      // deep-equality removal for primitives / whole objects
      this._set(key, {
        $setDifference: [{ $ifNull: [`$${key}`, []] }, input],
      })
    }
  }
}
