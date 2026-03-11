// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Post } from "./test-relations.as"

export class Author {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Author"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Author)
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
    "createdAt",
    $().designType("number")
      .tags("created", "timestamp", "number")
      .annotate("db.default.now", true)
      .annotate("expect.int", true)
      .optional()
      .$type
  ).prop(
    "posts",
    $("array")
      .of($()
          .refTo(() => Post)
          .annotate("db.table", "posts")
          .$type)
      .annotate("db.rel.from", true)
      .optional()
      .$type
  )
  .annotate("db.table", "authors")

// prettier-ignore-end