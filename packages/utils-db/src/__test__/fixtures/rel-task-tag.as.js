// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Task } from "./rel-task.as"
import { Tag } from "./rel-tag.as"

export class TaskTag {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TaskTag"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", TaskTag)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.fn", "increment")
      .$type
  ).prop(
    "taskId",
    $()
      .refTo(() => Task, ["id"])
      .annotate("db.rel.FK", true)
      .$type
  ).prop(
    "tagId",
    $()
      .refTo(() => Tag, ["id"])
      .annotate("db.rel.FK", true)
      .$type
  )
  .annotate("db.table", "task_tags")

// prettier-ignore-end