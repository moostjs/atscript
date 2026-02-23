// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class IdPlugin {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "IdPlugin"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class UniqueItems {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "UniqueItems"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", IdPlugin)
  .prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  flags: "",  }, true)
      .$type
  )
  .annotate("mongo.collection", "IdPlugin")

$("object", UniqueItems)
  .prop(
    "str",
    $("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .optional()
      .$type
  ).prop(
    "strUnique",
    $("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .annotate("mongo.array.uniqueItems", true)
      .optional()
      .$type
  ).prop(
    "obj",
    $("array")
      .of($("object")
          .prop(
            "a",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "b",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type)
      .optional()
      .$type
  ).prop(
    "objUnique",
    $("array")
      .of($("object")
          .prop(
            "a",
            $().designType("string")
              .tags("string")
              .$type
          ).prop(
            "b",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type)
      .annotate("mongo.array.uniqueItems", true)
      .optional()
      .$type
  ).prop(
    "kObj",
    $("array")
      .of($("object")
          .prop(
            "a",
            $().designType("string")
              .tags("string")
              .annotate("meta.isKey", true)
              .$type
          ).prop(
            "b",
            $().designType("string")
              .tags("string")
              .$type
          )
          .$type)
      .annotate("mongo.array.uniqueItems", true)
      .optional()
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  flags: "",  }, true)
      .$type
  )
  .annotate("mongo.collection", "UniqueItems")

// prettier-ignore-end