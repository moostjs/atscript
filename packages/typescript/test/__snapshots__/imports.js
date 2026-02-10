// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"
import { User } from "./multiple-interface.as"
import { TPrimitive, TNumber } from "./type.as"

export class People {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
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