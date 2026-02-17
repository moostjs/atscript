// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

export class ArraysCollection {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}

$("object", ArraysCollection)
  .prop(
    "primitive",
    $("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .$type
  ).prop(
    "primitiveComplex",
    $("array")
      .of($("union")
          .item($().designType("number")
              .tags("number")
              .$type)
          .item($().designType("string")
              .tags("string")
              .$type)
          .$type)
      .$type
  ).prop(
    "withKey",
    $("array")
      .of($("object")
          .prop(
            "key1",
            $().designType("string")
              .tags("string")
              .annotate("meta.isKey", true)
              .$type
          ).prop(
            "key2",
            $().designType("string")
              .tags("string")
              .annotate("meta.isKey", true)
              .$type
          ).prop(
            "value",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "attribute",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type)
      .$type
  ).prop(
    "withKeyMerge",
    $("array")
      .of($("object")
          .prop(
            "key1",
            $().designType("string")
              .tags("string")
              .annotate("meta.isKey", true)
              .$type
          ).prop(
            "key2",
            $().designType("string")
              .tags("string")
              .annotate("meta.isKey", true)
              .$type
          ).prop(
            "value",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "attribute",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type)
      .annotate("mongo.patch.strategy", "merge")
      .$type
  ).prop(
    "withoutKey",
    $("array")
      .of($("object")
          .prop(
            "key",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "value",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "attribute",
            $().designType("string")
              .tags("string")
              .optional()
              .$type
          )
          .$type)
      .$type
  ).prop(
    "withoutKeyMerge",
    $("array")
      .of($("object")
          .prop(
            "key",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "value",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "attribute",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type)
      .annotate("mongo.patch.strategy", "merge")
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  flags: "",  }, true)
      .$type
  )
  .annotate("mongo.collection", "arrays")

// prettier-ignore-end