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
  static dimensions = ['status', 'currency']
  static measures = ['amount', 'quantity']
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
    "currency",
    $().designType("string")
      .tags("string")
      .annotate("db.column.dimension", true)
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
  )
  .annotate("db.table", "orders")

// prettier-ignore-end