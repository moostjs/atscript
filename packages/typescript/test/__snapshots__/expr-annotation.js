// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class Issue {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Issue"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Queue {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Queue"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Issue)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "raisedAt",
    $().designType("number")
      .tags("number")
      .$type
  )

$("object", Queue)
  .prop(
    "rank",
    $().designType("number")
      .tags("number")
      .annotate("some.compute", { op: "+", args: [{ op: "*", args: [{ field: "openCount" }, 10] }, { field: "overdueCount" }] })
      .$type
  ).prop(
    "score",
    $().designType("number")
      .tags("number")
      .annotate("some.compute", { op: "-", args: [{ op: "/", args: [{ op: "*", args: [{ op: "neg", args: [{ op: "-", args: [{ field: "a" }, { field: "b" }] }] }, 2] }, { op: "coalesce", args: [{ field: "c" }, 1.5] }] }, -1] })
      .$type
  ).prop(
    "oldest",
    $().designType("number")
      .tags("number")
      .annotate("some.joins", { target: () => Issue,  order: [{ ref: { field: "raisedAt" }, desc: true }, { ref: { type: () => Issue, field: "id" } }] })
      .$type
  )

// prettier-ignore-end