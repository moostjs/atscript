// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

class TAddress {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class ExplorationForm {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", TAddress)
  .prop(
    "street",
    $().designType("string")
      .tags("string")
      .annotate("label", "Street")
      .$type
  ).prop(
    "city",
    $().designType("string")
      .tags("string")
      .annotate("label", "City")
      .$type
  )
  .annotate("label", "Address")

$("object", ExplorationForm)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Name")
      .$type
  ).prop(
    "addresses",
    $("array")
      .of($()
          .refTo(TAddress)
          .annotate("label", "Address")
          .$type)
      .annotate("label", "Addresses")
      .$type
  )

// prettier-ignore-end