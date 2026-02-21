// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class WithMetadata {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class SomeType {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", WithMetadata)
  .prop(
    "prop1",
    $().designType("string")
      .tags("string")
      .annotate("label", "Prop1")
      .$type
  ).prop(
    "prop-2",
    $().designType("number")
      .tags("int", "number")
      .annotate("mul", 1, true)
      .annotate("mul", 2, true)
      .annotate("mul", 3, true)
      .annotate("long.nested.name", "Prop-2")
      .annotate("long.nested.name2", "Prop-2-2")
      .annotate("expect.int", true)
      .$type
  ).prop(
    "obj",
    $("object")
      .prop(
        "prop3",
        $().designType("string")
          .tags("string")
          .annotate("label", "Prop3")
          .$type
      ).prop(
        "prop4",
        $().designType("string")
          .tags("string")
          .annotate("label", "Prop4")
          .$type
      ).prop(
        "nested2",
        $("object")
          .prop(
            "nested3",
            $("object")
              .prop(
                "a",
                $().designType("number")
                  .tags("double", "number")
                  .annotate("label", "Prop5")
                  .$type
              ).prop(
                "b",
                $().designType("string")
                  .tags("string")
                  .annotate("labelOptional", true)
                  .$type
              ).prop(
                "d",
                $().designType("boolean")
                  .tags("true", "boolean")
                  .annotate("mul", 3, true)
                  .$type
              ).prop(
                "e",
                $().designType("null")
                  .tags("null")
                  .annotate("mulOptional", true, true)
                  .$type
              ).prop(
                "f",
                $().designType("undefined")
                  .tags("undefined")
                  .annotate("obj", { prop1: "123",  })
                  .$type
              )
              .$type
          )
          .annotate("obj", { prop1: "str",  prop2: 123,  prop3: false })
          .$type
      )
      .annotate("nested", true)
      .$type
  )
  .annotate("id", "interface-with-metadata")
  .annotate("long.nested.name", "WithMetadata")
  .annotate("bool.flag", true)

$("object", SomeType)
  .prop(
    "a",
    $()
      .designType("string")
      .value("b")
      .annotate("id", "Some type")
      .annotate("label", "Prop1")
      .$type
  )
  .annotate("id", "Some type")

// prettier-ignore-end