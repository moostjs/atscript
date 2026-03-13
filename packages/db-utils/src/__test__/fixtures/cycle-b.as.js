// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { CycleA } from "./cycle-a.as"

export class CycleB {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "CycleB"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", CycleB)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", true)
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "aId",
    $()
      .refTo(() => CycleA, ["id"])
      .annotate("db.rel.FK", true)
      .annotate("db.rel.onDelete", "cascade")
      .optional()
      .$type
  )
  .annotate("db.table", "cycle_b")

// prettier-ignore-end