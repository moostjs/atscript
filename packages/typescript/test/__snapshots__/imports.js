// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { User } from "./multiple-interface.as"
import { TPrimitive, TNumber } from "./type.as"

export class People {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", People)
  .prop(
    "groupName",
    $()
      .refTo(TPrimitive)
      .$type
  ).prop(
    "size",
    $()
      .refTo(TNumber)
      .$type
  ).prop(
    "users",
    $("array")
      .of($()
          .refTo(User)
          .$type)
      .$type
  )

// prettier-ignore-end