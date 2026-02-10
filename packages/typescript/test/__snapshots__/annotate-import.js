// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"
import { MyInterface } from "./annotate-nonmutating.as"

export class ImportedAnnotated {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
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