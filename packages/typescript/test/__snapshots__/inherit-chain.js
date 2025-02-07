import { defineAnnotatedType as $ } from "@atscript/typescript"

class TType {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class I1 {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class I2 {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("", TType).designType("string")
  .flags("string")
  .annotate("fromTType", true)
  .annotate("from", "TType")
  .annotate("pass1", "TType")
  .annotate("pass2", "TType")
  .annotate("pass3", "TType")

$("object", I1)
  .prop(
    "prop",
    $().designType("string")
      .flags("string")
      .annotate("fromI1", true)
      .annotate("from", "I1")
      .annotate("pass2", "I1")
      .optional()
      .$type
  )

$("object", I2)
  .prop(
    "prop",
    $().designType("string")
      .flags("string")
      .annotate("fromI2", true)
      .annotate("from", "I2")
      .annotate("pass3", "I2")
      .optional()
      .$type
  )
