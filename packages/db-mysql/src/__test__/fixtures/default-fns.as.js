// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class TokenTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TokenTable"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class CounterTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "CounterTable"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class SimpleCounterTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "SimpleCounterTable"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", TokenTable)
  .prop(
    "id",
    $().designType("string")
      .tags("string")
      .annotate("meta.id", true)
      .annotate("db.default.uuid", true)
      .$type
  ).prop(
    "label",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "createdAt",
    $().designType("number")
      .tags("created", "timestamp", "number")
      .annotate("db.default.now", true)
      .annotate("expect.int", true)
      .optional()
      .$type
  )
  .annotate("db.table", "tokens")

$("object", CounterTable)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", 1000)
      .$type
  ).prop(
    "label",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "createdAt",
    $().designType("number")
      .tags("created", "timestamp", "number")
      .annotate("db.default.now", true)
      .annotate("expect.int", true)
      .optional()
      .$type
  )
  .annotate("db.table", "counters")

$("object", SimpleCounterTable)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", true)
      .$type
  ).prop(
    "label",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("db.table", "simple_counters")

// prettier-ignore-end