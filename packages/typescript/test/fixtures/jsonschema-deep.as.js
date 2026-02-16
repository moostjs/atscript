// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

export class JsonDeep {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}

$("object", JsonDeep)
  .prop(
    "s",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "n",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "c",
    $("union")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($().designType("number")
          .tags("number")
          .$type)
      .$type
  ).prop(
    "obj",
    $("object")
      .prop(
        "a",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "b",
        $().designType("number")
          .tags("number")
          .$type
      ).prop(
        "c",
        $().designType("boolean")
          .tags("boolean")
          .$type
      )
      .$type
  ).prop(
    "a",
    $("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .$type
  ).prop(
    "aObj",
    $("array")
      .of($("object")
          .prop(
            "a",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "b",
            $().designType("number")
              .tags("number")
              .$type
          ).prop(
            "c",
            $().designType("boolean")
              .tags("boolean")
              .$type
          )
          .$type)
      .$type
  ).prop(
    "optional",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  ).prop(
    "optionalObj",
    $("object")
      .prop(
        "a",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "b",
        $().designType("number")
          .tags("number")
          .$type
      ).prop(
        "c",
        $().designType("boolean")
          .tags("boolean")
          .$type
      )
      .optional()
      .$type
  ).prop(
    "deep",
    $("object")
      .prop(
        "deeper",
        $("object")
          .prop(
            "deepest",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type
      )
      .$type
  )

// prettier-ignore-end