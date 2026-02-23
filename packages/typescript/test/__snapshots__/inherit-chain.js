// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

class TType {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TType"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class I1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "I1"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class I2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "I2"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
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
    $()
      .refTo(TType)
      .annotate("fromTType", true)
      .annotate("from", "TType")
      .annotate("pass1", "TType")
      .annotate("pass2", "TType")
      .annotate("pass3", "TType")
      .annotate("fromI1", true)
      .annotate("from", "I1")
      .annotate("pass2", "I1")
      .optional()
      .$type
  )

$("object", I2)
  .prop(
    "prop",
    $()
      .refTo(I1, ["prop"])
      .annotate("fromI2", true)
      .annotate("from", "I2")
      .annotate("pass3", "I2")
      .annotate("fromTType", true)
      .annotate("pass1", "TType")
      .annotate("pass2", "TType")
      .optional()
      .$type
  )

// prettier-ignore-end