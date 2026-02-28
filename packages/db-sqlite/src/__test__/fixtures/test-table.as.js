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

$("object", UsersTable)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("string")
      .annotate("db.index.unique", "email_idx", true)
      .annotate("db.column", "email_address")
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("db.index.plain", { name: "name_idx",  }, true)
      .$type
  ).prop(
    "createdAt",
    $().designType("number")
      .tags("number")
      .annotate("db.index.plain", { name: "name_idx",  }, true)
      .annotate("db.index.plain", { name: "created_idx",  sort: "desc" }, true)
      .annotate("db.default.fn", "now")
      .$type
  ).prop(
    "displayName",
    $().designType("string")
      .tags("string")
      .annotate("db.ignore", true)
      .optional()
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
      .annotate("db.index.fulltext", "search_idx", true)
      .optional()
      .$type
  )
  .annotate("db.table", "users")
  .annotate("db.schema", "auth")

$("object", NoTableAnnotation)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  )

// prettier-ignore-end