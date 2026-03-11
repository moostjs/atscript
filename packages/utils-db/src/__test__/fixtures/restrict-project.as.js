// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { User } from "./restrict-user.as"

export class Project {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Project"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Project)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", true)
      .$type
  ).prop(
    "title",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "ownerId",
    $()
      .refTo(() => User, ["id"])
      .annotate("db.rel.FK", true)
      .annotate("db.rel.onDelete", "cascade")
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
  .annotate("db.table", "projects")

// prettier-ignore-end