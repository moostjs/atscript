// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { User } from "./restrict-user.as"

export class Category {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Category"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Category)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.fn", "increment")
      .$type
  ).prop(
    "label",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "ownerId",
    $()
      .refTo(() => User, ["id"])
      .annotate("db.rel.FK", true)
      .annotate("db.rel.onDelete", "restrict")
      .$type
  ).prop(
    "owner",
    $()
      .refTo(() => User)
      .annotate("db.table", "users")
      .annotate("db.rel.to", true)
      .optional()
      .$type
  )
  .annotate("db.table", "categories")

// prettier-ignore-end