// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a, buildJsonSchema as $$ } from "@atscript/typescript/utils"

class TType {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


class I1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class I2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
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

// prettier-ignore-end