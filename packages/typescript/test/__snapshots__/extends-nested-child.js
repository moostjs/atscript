// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { Helper } from "./extends-nested-base.as"
import { Base } from "./extends-nested-base.as"

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
    "state",
    $("object")
      .prop(
        "context",
        $()
          .refTo(() => Helper)
          .$type
      ).prop(
        "items",
        $("array")
          .of($()
              .refTo(() => Helper)
              .$type)
          .$type
      ).prop(
        "union",
        $("union")
          .item($()
              .refTo(() => Helper)
              .$type)
          .item($().designType("string")
              .tags("string")
              .$type)
          .$type
      )
      .$type
  ).prop(
    "id",
    $().designType("string")
      .tags("string")
      .$type
  )

// prettier-ignore-end