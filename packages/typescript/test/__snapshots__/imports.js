// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $ } from "@atscript/typescript"
import { User } from "./multiple-interface.as"
import { TPrimitive, TNumber } from "./type.as"

export class People {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
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