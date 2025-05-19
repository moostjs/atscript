import { defineAnnotatedType as $ } from "@atscript/typescript"

class TType {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class I1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class I2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("", TType).designType("string")
  .tags("string")
  .annotate("fromTType", true)
  .annotate("from", "TType")
  .annotate("pass1", "TType")
  .annotate("pass2", "TType")
  .annotate("pass3", "TType")

$("object", I1)
  .prop(
    "prop",
    $().designType("string")
      .tags("string")
      .annotate("fromI1", true)
      .annotate("from", "I1")
      .annotate("pass2", "I1")
      .annotate("fromTType", true)
      .annotate("pass1", "TType")
      .annotate("pass3", "TType")
      .optional()
      .$type
  )

$("object", I2)
  .prop(
    "prop",
    $().designType("string")
      .tags("string")
      .annotate("fromI2", true)
      .annotate("from", "I2")
      .annotate("pass3", "I2")
      .annotate("fromTType", true)
      .annotate("pass1", "TType")
      .annotate("pass2", "TType")
      .optional()
      .$type
  )
