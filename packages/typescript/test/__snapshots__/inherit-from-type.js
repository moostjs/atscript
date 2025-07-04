// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $ } from "@atscript/typescript"

class TFirstName {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class TLastName {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class TAge {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class ITarget {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("", TFirstName).designType("string")
  .tags("string")
  .annotate("label", "First Name")

$("", TLastName).designType("string")
  .tags("string")
  .annotate("label", "Last Name")

$("", TAge).designType("number")
  .tags("number")
  .annotate("min", 18)

$("object", ITarget)
  .prop(
    "firstName",
    $().designType("string")
      .tags("string")
      .annotate("label", "First Name")
      .$type
  ).prop(
    "lastName",
    $().designType("string")
      .tags("string")
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .optional()
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .annotate("min", 18)
      .$type
  )

// prettier-ignore-end