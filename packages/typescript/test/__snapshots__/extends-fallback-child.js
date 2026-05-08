// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Helper as Helper_2 } from "./extends-fallback-base.as"
import { Base } from "./extends-fallback-base.as"

export class Helper {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Helper"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Helper_1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Helper_1"
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

$("object", Helper_1)
  .prop(
    "alsoFromChild",
    $().designType("boolean")
      .tags("boolean")
      .$type
  )

$("object", Child)
  .prop(
    "payload",
    $()
      .refTo(() => Helper_2)
      .$type
  ).prop(
    "a",
    $()
      .refTo(Helper)
      .$type
  ).prop(
    "b",
    $()
      .refTo(Helper_1)
      .$type
  )

// prettier-ignore-end