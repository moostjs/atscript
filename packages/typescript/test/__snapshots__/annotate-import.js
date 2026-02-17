// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"
import { MyInterface } from "./annotate-nonmutating.as"

export class ImportedAnnotated {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}

$("object", ImportedAnnotated)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Imported Name")
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .annotate("label", "Original Age")
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("email", "string")
      .annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true)
      .$type
  ).prop(
    "address",
    $("object")
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
          .annotate("label", "Imported City")
          .$type
      )
      .$type
  )
  .annotate("meta.description", "Original")

// prettier-ignore-end