// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

class TFirstName {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TFirstName"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class TLastName {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TLastName"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class TAge {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TAge"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class ITarget {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ITarget"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
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
    $()
      .refTo(TFirstName)
      .annotate("label", "First Name")
      .$type
  ).prop(
    "lastName",
    $()
      .refTo(TLastName)
      .annotate("label", "Last Name")
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .optional()
      .$type
  ).prop(
    "age",
    $()
      .refTo(TAge)
      .annotate("min", 18)
      .$type
  )

// prettier-ignore-end