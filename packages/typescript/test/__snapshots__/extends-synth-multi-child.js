// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Helper } from "./extends-synth-multi-base1.as"
import { Helper as Helper_1 } from "./extends-synth-multi-base2.as"
import { Base1 } from "./extends-synth-multi-base1.as"
import { Base2 } from "./extends-synth-multi-base2.as"

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
    "propA",
    $()
      .refTo(() => Helper)
      .$type
  ).prop(
    "propB",
    $()
      .refTo(() => Helper_1)
      .$type
  ).prop(
    "id",
    $().designType("string")
      .tags("string")
      .$type
  )

// prettier-ignore-end