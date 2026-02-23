// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class SimpleCollection {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "SimpleCollection"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class MinimalCollection {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "MinimalCollection"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class MinimalCollectionString {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "MinimalCollectionString"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", SimpleCollection)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "active",
    $().designType("boolean")
      .tags("boolean")
      .$type
  ).prop(
    "occupation",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  ).prop(
    "tags",
    $("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .optional()
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "address",
    $("object")
      .prop(
        "line1",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "line2",
        $().designType("string")
          .tags("string")
          .optional()
          .$type
      ).prop(
        "city",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "state",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "zip",
        $().designType("string")
          .tags("string")
          .$type
      )
      .annotate("mongo.patch.strategy", "replace")
      .$type
  ).prop(
    "contacts",
    $("object")
      .prop(
        "email",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "phone",
        $().designType("string")
          .tags("string")
          .$type
      )
      .annotate("mongo.patch.strategy", "merge")
      .$type
  ).prop(
    "nested",
    $("object")
      .prop(
        "nested1",
        $("object")
          .prop(
            "a",
            $().designType("number")
              .tags("number")
              .optional()
              .$type
          ).prop(
            "b",
            $().designType("string")
              .tags("string")
              .optional()
              .$type
          )
          .annotate("mongo.patch.strategy", "replace")
          .optional()
          .$type
      ).prop(
        "nested2",
        $("object")
          .prop(
            "c",
            $().designType("number")
              .tags("number")
              .optional()
              .$type
          ).prop(
            "d",
            $().designType("string")
              .tags("string")
              .optional()
              .$type
          )
          .annotate("mongo.patch.strategy", "merge")
          .optional()
          .$type
      )
      .annotate("mongo.patch.strategy", "merge")
      .optional()
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  flags: "",  }, true)
      .$type
  )
  .annotate("mongo.collection", "simple")

$("object", MinimalCollection)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  flags: "",  }, true)
      .$type
  )
  .annotate("mongo.collection", "minimal")

$("object", MinimalCollectionString)
  .prop(
    "_id",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("mongo.collection", "minimal-string")

// prettier-ignore-end