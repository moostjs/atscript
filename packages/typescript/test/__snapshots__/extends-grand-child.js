// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Helper } from "./extends-grand-grand.as"
import { Mid } from "./extends-grand-mid.as"

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
    "g",
    $()
      .refTo(() => Helper)
      .$type
  ).prop(
    "m",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "c",
    $().designType("string")
      .tags("string")
      .$type
  )

// prettier-ignore-end