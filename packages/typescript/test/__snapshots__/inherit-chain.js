import { defineAnnotatedType as $ } from "@anscript/typescript/runtime"

class TType {}
$("", TType)
  .designType("string")
  .type(String)
  .annotate("fromTType", true)
  .annotate("from", "TType")
  .annotate("pass1", "TType")
  .annotate("pass2", "TType")
  .annotate("pass3", "TType")


class I1 {}
$("object", I1)
  .prop(
    "prop",
    $("ref")
      .refTo(TType)
      .annotate("fromI1", true)
      .annotate("from", "I1")
      .annotate("pass2", "I1")
      .$type
  )


export class I2 {}
$("object", I2)
  .prop(
    "prop",
    $("ref")
      .refTo(I1, ["prop"])
      .annotate("fromI2", true)
      .annotate("from", "I2")
      .annotate("pass3", "I2")
      .$type
  )
