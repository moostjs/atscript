// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { CycleB } from "./cycle-b.as"

export class CycleA {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "CycleA"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", CycleA)
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
    "bId",
    $()
      .refTo(() => CycleB, ["id"])
      .annotate("db.rel.FK", true)
      .annotate("db.rel.onDelete", "cascade")
      .optional()
      .$type
  )
  .annotate("db.table", "cycle_a")

// prettier-ignore-end