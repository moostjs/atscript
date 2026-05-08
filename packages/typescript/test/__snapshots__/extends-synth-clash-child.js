// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Helper as Helper_1 } from "./extends-synth-clash-base.as"
import { Base } from "./extends-synth-clash-base.as"

export class Helper {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Helper"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Child {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Child"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Helper)
  .prop(
    "fromChild",
    $().designType("number")
      .tags("number")
      .$type
  )

$("object", Child)
  .prop(
    "payload",
    $()
      .refTo(() => Helper_1)
      .$type
  ).prop(
    "own",
    $()
      .refTo(Helper)
      .$type
  )

// prettier-ignore-end