// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Author } from "./rel-author.as"
import { Post } from "./test-relations.as"

export class Comment {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Comment"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Comment)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.fn", "increment")
      .$type
  ).prop(
    "body",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "createdAt",
    $().designType("number")
      .tags("created", "timestamp", "number")
      .annotate("db.default.fn", "now")
      .annotate("expect.int", true)
      .optional()
      .$type
  ).prop(
    "postId",
    $()
      .refTo(() => Post, ["id"])
      .annotate("db.rel.FK", true)
      .annotate("db.rel.onDelete", "cascade")
      .$type
  ).prop(
    "authorId",
    $()
      .refTo(() => Author, ["id"])
      .annotate("db.rel.FK", true)
      .optional()
      .$type
  ).prop(
    "post",
    $()
      .refTo(() => Post)
      .annotate("db.table", "posts")
      .annotate("db.rel.to", true)
      .optional()
      .$type
  )
  .annotate("db.table", "comments")

// prettier-ignore-end