// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class Project {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Project"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Task {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Task"
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
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("db.table", "projects")

$("object", Task)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "title",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "projectId",
    $()
      .refTo(Project, ["id"])
      .annotate("db.rel.FK", true)
      .$type
  ).prop(
    "reviewerId",
    $()
      .refTo(Project, ["id"])
      .annotate("db.rel.FK", "reviewer")
      .optional()
      .$type
  )
  .annotate("db.table", "tasks")

// prettier-ignore-end