// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class ArraysCollection {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ArraysCollection"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
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
              .annotate("expect.array.key", true)
              .$type
          ).prop(
            "key2",
            $().designType("string")
              .tags("string")
              .annotate("expect.array.key", true)
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
              .annotate("expect.array.key", true)
              .$type
          ).prop(
            "key2",
            $().designType("string")
              .tags("string")
              .annotate("expect.array.key", true)
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
      .annotate("db.mongo.patch.strategy", "merge")
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
      .annotate("db.mongo.patch.strategy", "merge")
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  }, true)
      .$type
  )
  .annotate("db.table", "arrays")
  .annotate("db.mongo.collection", true)

// prettier-ignore-end