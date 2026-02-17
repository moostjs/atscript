// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

export class FlattenTest {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}

$("object", FlattenTest)
  .prop(
    "level0",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "nested",
    $("object")
      .prop(
        "level1",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "array1",
        $("array")
          .of($("object")
              .prop(
                "level2",
                $().designType("string")
                  .tags("string")
                  .$type
              ).prop(
                "array2",
                $("array")
                  .of($("object")
                      .prop(
                        "level3",
                        $().designType("string")
                          .tags("string")
                          .$type
                      )
                      .$type)
                  .$type
              )
              .$type)
          .$type
      )
      .$type
  ).prop(
    "array0",
    $("array")
      .of($("object")
          .prop(
            "level1",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type)
      .$type
  ).prop(
    "complexArray",
    $("union")
      .item($("object")
          .prop(
            "field1",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type)
      .item($("array")
          .of($("object")
              .prop(
                "field1",
                $().designType("number")
                  .tags("number")
                  .$type
              ).prop(
                "field2",
                $().designType("string")
                  .tags("string")
                  .$type
              )
              .$type)
          .$type)
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  flags: "",  }, true)
      .$type
  )
  .annotate("mongo.collection", "flatten-test")

// prettier-ignore-end