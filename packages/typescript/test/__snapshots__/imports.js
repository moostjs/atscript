// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"
import { User } from "./multiple-interface.as"
import { TPrimitive, TNumber } from "./type.as"

export class People {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @ts.buildJsonSchema annotation to individual interfaces.")
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