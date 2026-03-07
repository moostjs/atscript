// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Author } from "./rel-author.as"
import { Comment } from "./rel-comment.as"

export class Post {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Post"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Post)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.fn", "increment")
      .$type
  ).prop(
    "title",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "status",
    $().designType("string")
      .tags("string")
      .annotate("db.default", "draft")
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
    "authorId",
    $()
      .refTo(() => Author, ["id"])
      .annotate("db.rel.FK", true)
      .annotate("db.rel.onDelete", "cascade")
      .$type
  ).prop(
    "author",
    $()
      .refTo(() => Author)
      .annotate("db.table", "authors")
      .annotate("db.rel.to", true)
      .optional()
      .$type
  ).prop(
    "comments",
    $("array")
      .of($()
          .refTo(() => Comment)
          .annotate("db.table", "comments")
          .$type)
      .annotate("db.rel.from", true)
      .optional()
      .$type
  )
  .annotate("db.table", "posts")

// prettier-ignore-end