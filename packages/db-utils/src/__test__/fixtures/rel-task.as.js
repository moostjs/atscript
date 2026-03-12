// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Tag } from "./rel-tag.as"
import { TaskTag } from "./rel-task-tag.as"

export class Task {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Task"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Task)
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
    "tags",
    $("array")
      .of($()
          .refTo(() => Tag)
          .annotate("db.table", "tags")
          .$type)
      .annotate("db.rel.via", () => TaskTag)
      .optional()
      .$type
  )
  .annotate("db.table", "tasks")

// prettier-ignore-end