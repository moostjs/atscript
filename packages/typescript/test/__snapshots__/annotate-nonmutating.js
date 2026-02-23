// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class MyInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "MyInterface"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class AnnotatedInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "AnnotatedInterface"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
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