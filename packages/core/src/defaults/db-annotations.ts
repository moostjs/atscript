import type { TAnnotationsTree } from '../config'
import { dbColumnAnnotations } from './db-ann-column'
import { dbIndexAnnotations } from './db-ann-index'
import { dbRelAnnotations } from './db-ann-rel'
import { dbTableAnnotations } from './db-ann-table'
import { dbViewAnnotations } from './db-ann-view'

export const dbAnnotations: TAnnotationsTree = {
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
}
