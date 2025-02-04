import { defineAnnotatedType as $ } from "@anscript/typescript"

class ISource {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class ITarget {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("object", ISource)
  .prop(
    "firstName",
    $().designType("string")
      .flags("string")
      .annotate("label", "First Name")
      .$type
  ).prop(
    "lastName",
    $().designType("string")
      .flags("string")
      .annotate("label", "Last Name")
      .$type
  ).prop(
    "age",
    $().designType("number")
      .flags("number")
      .annotate("min", 18)
      .$type
  )

$("object", ITarget)
  .prop(
    "firstName",
    $().designType("string")
      .flags("string")
      .$type
  ).prop(
    "lastName",
    $().designType("string")
      .flags("string")
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .optional()
      .$type
  ).prop(
    "age",
    $().designType("number")
      .flags("number")
      .$type
  )
