import { defineAnnotatedType as $ } from "@anscript/typescript"

class TType {}
$("", TType)
  .designType("string")
  .flags("string")
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
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .annotate("fromI1", true)
      .annotate("from", "I1")
      .annotate("pass2", "I1")
      .optional()
      .$type
  )


export class I2 {}
$("object", I2)
  .prop(
    "prop",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .annotate("fromI2", true)
      .annotate("from", "I2")
      .annotate("pass3", "I2")
      .optional()
      .$type
  )
