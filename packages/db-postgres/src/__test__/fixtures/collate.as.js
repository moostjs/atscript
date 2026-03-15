// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class AccountTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "AccountTable"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", AccountTable)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", true)
      .$type
  ).prop(
    "nickname",
    $().designType("string")
      .tags("string")
      .annotate("db.column.collate", "nocase")
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("db.table", "accounts")

// prettier-ignore-end