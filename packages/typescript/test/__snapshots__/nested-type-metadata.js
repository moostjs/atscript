// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

class TAddress {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


export class ExplorationForm {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
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
          .$type)
      .annotate("label", "Addresses")
      .$type
  )

// prettier-ignore-end