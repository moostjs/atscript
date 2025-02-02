import { defineAnnotatedType as $ } from "@anscript/typescript"

class TFirstName{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class TLastName{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class TAge{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class ITarget{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("", TFirstName)
  .designType("string")
  .flags("string")
  .type(String)
  .annotate("label", "First Name")

$("", TLastName)
  .designType("string")
  .flags("string")
  .type(String)
  .annotate("label", "Last Name")

$("", TAge)
  .designType("number")
  .flags("number")
  .type(Number)
  .annotate("min", 18)

$("object", ITarget)
  .prop(
    "firstName",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "lastName",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .optional()
      .$type
  ).prop(
    "age",
    $()
      .designType("number")
      .flags("number")
      .type(Number)
      .$type
  )
