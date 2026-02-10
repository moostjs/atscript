// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"

export class WithPatterns {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


class WithPatterns2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}

$("object", WithPatterns)
  .prop(
    "prop1",
    $().designType("string")
      .tags("string")
      .$type
  ).propPattern(
    /./,
    $().designType("number")
      .tags("number")
      .$type
  ).propPattern(
    /^abc/i,
    $().designType("boolean")
      .tags("boolean")
      .$type
  ).prop(
    "nested",
    $("object")
      .propPattern(
        /./,
        $().designType("never")
          .tags("never")
          .$type
      ).propPattern(
        /^str/i,
        $().designType("string")
          .tags("string")
          .$type
      )
      .$type
  )

$("object", WithPatterns2)
  .propPattern(
    /./,
    $().designType("boolean")
      .tags("boolean")
      .$type
  )

// prettier-ignore-end