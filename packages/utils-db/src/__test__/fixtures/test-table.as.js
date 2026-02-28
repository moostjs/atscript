// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class UsersTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "UsersTable"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

export class NoTableAnnotation {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "NoTableAnnotation"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

// @db.table "users"
// @db.schema "auth"
// interface UsersTable {
//   @meta.id
//   id: number
//
//   @db.index.unique "email_idx"
//   @db.column "email_address"
//   email: string
//
//   @db.index.plain "name_idx"
//   name: string
//
//   @db.index.plain "name_idx"
//   @db.index.plain "created_idx", "desc"
//   @db.default.fn "now"
//   createdAt: number
//
//   @db.ignore
//   displayName?: string
//
//   @db.default.value "active"
//   status: string
//
//   @db.index.fulltext "search_idx"
//   bio?: string
// }

$("object", UsersTable)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id")
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("string")
      .annotate("db.index.unique", { name: "email_idx" }, true)
      .annotate("db.column", "email_address")
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("db.index.plain", { name: "name_idx" }, true)
      .$type
  ).prop(
    "createdAt",
    $().designType("number")
      .tags("number")
      .annotate("db.index.plain", { name: "name_idx" }, true)
      .annotate("db.index.plain", { name: "created_idx", sort: "desc" }, true)
      .annotate("db.default.fn", "now")
      .$type
  ).prop(
    "displayName",
    $().designType("string")
      .tags("string")
      .optional()
      .annotate("db.ignore")
      .$type
  ).prop(
    "status",
    $().designType("string")
      .tags("string")
      .annotate("db.default.value", "active")
      .$type
  ).prop(
    "bio",
    $().designType("string")
      .tags("string")
      .optional()
      .annotate("db.index.fulltext", { name: "search_idx" }, true)
      .$type
  )
  .annotate("db.table", "users")
  .annotate("db.schema", "auth")

// NoTableAnnotation — just a plain object, no @db.table
$("object", NoTableAnnotation)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  )
