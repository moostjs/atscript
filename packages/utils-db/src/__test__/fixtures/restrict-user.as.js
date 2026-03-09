// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Project } from "./restrict-project.as"
import { Category } from "./restrict-category.as"

export class User {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "User"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", User)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.fn", "increment")
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "projects",
    $("array")
      .of($()
          .refTo(() => Project)
          .annotate("db.table", "projects")
          .$type)
      .annotate("db.rel.from", true)
      .optional()
      .$type
  ).prop(
    "categories",
    $("array")
      .of($()
          .refTo(() => Category)
          .annotate("db.table", "categories")
          .$type)
      .annotate("db.rel.from", true)
      .optional()
      .$type
  )
  .annotate("db.table", "users")

// prettier-ignore-end