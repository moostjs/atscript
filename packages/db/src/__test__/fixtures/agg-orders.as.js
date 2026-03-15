// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class AggOrders {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "AggOrders"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
  static dimensions = ['status', 'region']
  static measures = ['amount', 'quantity']
}


export class PlainEvents {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "PlainEvents"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class IndexedMetrics {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "IndexedMetrics"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
  static dimensions = ['channel', 'source', 'code']
  static measures = ['revenue']
}

$("object", AggOrders)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "status",
    $().designType("string")
      .tags("string")
      .annotate("db.column.dimension", true)
      .$type
  ).prop(
    "region",
    $().designType("string")
      .tags("string")
      .annotate("db.column.dimension", true)
      .annotate("db.column", "region_code")
      .$type
  ).prop(
    "amount",
    $().designType("number")
      .tags("number")
      .annotate("db.column.measure", true)
      .$type
  ).prop(
    "quantity",
    $().designType("number")
      .tags("number")
      .annotate("db.column.measure", true)
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("db.table", "orders")

$("object", PlainEvents)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "category",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "value",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "label",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("db.table", "plain_events")

$("object", IndexedMetrics)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "channel",
    $().designType("string")
      .tags("string")
      .annotate("db.column.dimension", true)
      .annotate("db.index.plain", true)
      .$type
  ).prop(
    "source",
    $().designType("string")
      .tags("string")
      .annotate("db.column.dimension", true)
      .$type
  ).prop(
    "code",
    $().designType("string")
      .tags("string")
      .annotate("db.column.dimension", true)
      .annotate("db.index.unique", true)
      .$type
  ).prop(
    "revenue",
    $().designType("number")
      .tags("number")
      .annotate("db.column.measure", true)
      .$type
  )
  .annotate("db.table", "indexed_metrics")

// prettier-ignore-end