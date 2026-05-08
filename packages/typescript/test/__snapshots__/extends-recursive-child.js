// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"
import { JsonValue } from "./extends-recursive-base.as"
import { Base } from "./extends-recursive-base.as"

export class Child {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Child"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Child)
  .prop(
    "state",
    $("object")
      .prop(
        "context",
        $()
          .refTo(() => JsonValue)
          .$type
      ).prop(
        "meta",
        $("object")
          .propPattern(
            /^.+$/,
            $()
              .refTo(() => JsonValue)
              .$type
          )
          .optional()
          .$type
      )
      .$type
  ).prop(
    "id",
    $().designType("string")
      .tags("string")
      .$type
  )

// prettier-ignore-end