// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Helper } from "./extends-reexport-leaf.as"
import { Base } from "./extends-reexport-mid.as"

export class Child {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Child"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Child)
  .prop(
    "payload",
    $()
      .refTo(() => Helper)
      .$type
  ).prop(
    "id",
    $().designType("string")
      .tags("string")
      .$type
  )

// prettier-ignore-end