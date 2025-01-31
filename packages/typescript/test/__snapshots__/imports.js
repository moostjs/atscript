import { defineAnnotatedType as $ } from "@anscript/typescript/runtime"
import { User } from "./multiple-interface.as"
import { TPrimitive, TNumber } from "./type.as"

export class People {}
$("object", People)
  .prop(
    "groupName",
    $("ref")
      .refTo(TPrimitive)
      .$type
  ).prop(
    "size",
    $("ref")
      .refTo(TNumber)
      .$type
  ).prop(
    "users",
    $("array")
      .of($("ref")
          .refTo(User)
          .$def)
      .$type
  )
