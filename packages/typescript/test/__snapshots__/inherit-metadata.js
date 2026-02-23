// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

class ISource {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ISource"
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

$("object", ISource)
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
      .annotate("label", "Last Name")
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .annotate("min", 18)
      .$type
  )

$("object", ITarget)
  .prop(
    "firstName",
    $()
      .refTo(ISource, ["firstName"])
      .$type
  ).prop(
    "lastName",
    $()
      .refTo(ISource, ["lastName"])
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .optional()
      .$type
  ).prop(
    "age",
    $()
      .refTo(ISource, ["age"])
      .$type
  )

// prettier-ignore-end