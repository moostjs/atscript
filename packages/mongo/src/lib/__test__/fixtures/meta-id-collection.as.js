// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class TodoCollection {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TodoCollection"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class ItemCollection {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ItemCollection"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", TodoCollection)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.fn", "increment")
      .$type
  ).prop(
    "title",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "completed",
    $().designType("boolean")
      .tags("boolean")
      .annotate("db.default.value", "false")
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  }, true)
      .$type
  )
  .annotate("db.table", "todos")
  .annotate("db.mongo.collection", true)

$("object", ItemCollection)
  .prop(
    "code",
    $().designType("string")
      .tags("string")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  }, true)
      .$type
  )
  .annotate("db.table", "items")
  .annotate("db.mongo.collection", true)

// prettier-ignore-end