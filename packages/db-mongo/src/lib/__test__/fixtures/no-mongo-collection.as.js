// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class UserNoMongo {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "UserNoMongo"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", UserNoMongo)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", true)
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("string")
      .annotate("db.index.unique", "email_idx", true)
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("db.table", "users")

// prettier-ignore-end