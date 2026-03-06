// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class User {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "User"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Order {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Order"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", User)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("some.filter", { left: { field: "status" }, op: "$eq", right: "active" })
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .annotate("some.filter", { left: { field: "age" }, op: "$gte", right: 18 })
      .$type
  )

$("object", Order)
  .prop(
    "userId",
    $().designType("number")
      .tags("number")
      .annotate("some.filter", { left: { type: () => User, field: "status" }, op: "$eq", right: "active" })
      .$type
  ).prop(
    "total",
    $().designType("number")
      .tags("number")
      .annotate("some.filter", { "$and": [{ left: { field: "status" }, op: "$eq", right: "pending" }, { left: { field: "total" }, op: "$gt", right: 100 }] })
      .$type
  ).prop(
    "plan",
    $().designType("string")
      .tags("string")
      .annotate("some.filter", { "$and": [{ left: { field: "status" }, op: "$eq", right: "active" }, { "$or": [{ left: { field: "plan" }, op: "$eq", right: "premium" }, { left: { field: "role" }, op: "$eq", right: "admin" }] }] })
      .$type
  ).prop(
    "role",
    $().designType("string")
      .tags("string")
      .annotate("some.filter", { left: { field: "role" }, op: "$in", right: ["admin", "moderator"] })
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("string")
      .annotate("some.filter", { left: { field: "email" }, op: "$exists", right: true })
      .$type
  ).prop(
    "deleted",
    $().designType("boolean")
      .tags("boolean")
      .annotate("some.filter", { "$not": { left: { field: "deleted" }, op: "$eq", right: true } })
      .$type
  ).prop(
    "category",
    $().designType("string")
      .tags("string")
      .annotate("some.filter", { left: { field: "role" }, op: "$nin", right: ["banned", "suspended"] })
      .$type
  ).prop(
    "label",
    $().designType("string")
      .tags("string")
      .annotate("some.filter", { left: { field: "name" }, op: "$regex", right: "^admin" })
      .$type
  ).prop(
    "joinField",
    $().designType("string")
      .tags("string")
      .annotate("some.joins", { target: () => User,  on: { left: { type: () => Order, field: "userId" }, op: "$eq", right: { type: () => User, field: "id" } } })
      .$type
  )

// prettier-ignore-end