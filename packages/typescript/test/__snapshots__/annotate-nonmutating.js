// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"

export class MyInterface {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class AnnotatedInterface {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}

$("object", MyInterface)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Original Name")
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
          .$type
      )
      .$type
  )
  .annotate("meta.description", "Original")

$("object", AnnotatedInterface)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Custom Name")
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .annotate("label", "Custom Age")
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
          .annotate("label", "Custom Address City")
          .$type
      )
      .$type
  )
  .annotate("meta.description", "Annotated")

// prettier-ignore-end