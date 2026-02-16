// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

export class User {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return {"type":"object","properties":{"name":{"type":"string","minLength":3,"maxLength":20},"age":{"type":"number","minimum":18,"maximum":99}},"required":["name"]}
  }
}


export class NoAnnotation {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}

$("object", User)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("expect.minLength", { length: 3,  })
      .annotate("expect.maxLength", { length: 20,  })
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .annotate("expect.min", { minValue: 18,  })
      .annotate("expect.max", { maxValue: 99,  })
      .optional()
      .$type
  )
  .annotate("emit.jsonSchema", true)

$("object", NoAnnotation)
  .prop(
    "title",
    $().designType("string")
      .tags("string")
      .$type
  )

// prettier-ignore-end