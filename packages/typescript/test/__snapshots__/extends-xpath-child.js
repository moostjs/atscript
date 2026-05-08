// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Helper as Helper_1 } from "./extends-xpath-b.as"
import { Helper } from "./extends-xpath-a.as"
import { Base } from "./extends-xpath-b.as"

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
      .refTo(() => Helper_1)
      .$type
  ).prop(
    "fromUser",
    $()
      .refTo(() => Helper)
      .$type
  )

// prettier-ignore-end