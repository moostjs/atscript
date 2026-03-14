import type { TAtscriptPlugin } from '@atscript/core'
import { dbAggAnnotations } from './annotations/agg'
import { dbColumnAnnotations } from './annotations/column'
import { dbIndexAnnotations } from './annotations/index-ann'
import { dbRelAnnotations } from './annotations/rel'
import { dbTableAnnotations } from './annotations/table'
import { dbViewAnnotations } from './annotations/view'

export const dbPlugin: () => TAtscriptPlugin = () => ({
  name: 'db',

  config() {
    return {
      annotations: {
        db: {
          patch: dbColumnAnnotations.patch,
          table: dbTableAnnotations.table,
          schema: dbTableAnnotations.schema,
          index: dbIndexAnnotations.index,
          column: dbColumnAnnotations.column,
          default: dbColumnAnnotations.default,
          json: dbColumnAnnotations.json,
          ignore: dbColumnAnnotations.ignore,
          sync: dbTableAnnotations.sync,
          rel: dbRelAnnotations.rel,
          view: dbViewAnnotations.view,
          agg: dbAggAnnotations.agg,
        },
      },
    }
  },
})
