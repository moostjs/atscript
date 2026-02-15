// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

class TFirstName {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @ts.buildJsonSchema annotation to individual interfaces.")
  }
}


class TLastName {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @ts.buildJsonSchema annotation to individual interfaces.")
  }
}


class TAge {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @ts.buildJsonSchema annotation to individual interfaces.")
  }
}


export class ITarget {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @ts.buildJsonSchema annotation to individual interfaces.")
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