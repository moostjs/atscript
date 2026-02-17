// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

class TType {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


class I1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


export class I2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
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