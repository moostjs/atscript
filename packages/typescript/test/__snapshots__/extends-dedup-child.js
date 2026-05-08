// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Base, Helper } from "./extends-dedup-base.as"

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
    "own",
    $()
      .refTo(() => Helper)
      .$type
  )

// prettier-ignore-end