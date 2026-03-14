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


export class ProfileTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ProfileTable"
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


export class ActiveUsersView {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ActiveUsersView"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class LegacyReportView {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "LegacyReportView"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class RenamedTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "RenamedTable"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class RenamedView {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "RenamedView"
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
      .annotate("db.index.unique", "email_idx")
      .annotate("db.column", "email_address")
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("db.index.plain", "name_idx")
      .$type
  ).prop(
    "createdAt",
    $().designType("number")
      .tags("number")
      .annotate("db.index.plain", "name_idx", true)
      .annotate("db.index.plain", "created_idx", true)
      .annotate("db.default.now", true)
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
      .annotate("db.default", "active")
      .$type
  ).prop(
    "bio",
    $().designType("string")
      .tags("string")
      .annotate("db.index.fulltext", "search_idx")
      .optional()
      .$type
  )
  .annotate("db.table", "users")
  .annotate("db.schema", "auth")

$("object", ProfileTable)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", true)
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "contact",
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
          .optional()
          .$type
      )
      .$type
  ).prop(
    "preferences",
    $("object")
      .prop(
        "theme",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "lang",
        $().designType("string")
          .tags("string")
          .$type
      )
      .annotate("db.json", true)
      .$type
  ).prop(
    "tags",
    $("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .$type
  ).prop(
    "settings",
    $("object")
      .prop(
        "notifications",
        $("object")
          .prop(
            "email",
            $().designType("boolean")
              .tags("boolean")
              .$type
          ).prop(
            "sms",
            $().designType("boolean")
              .tags("boolean")
              .$type
          )
          .$type
      )
      .$type
  ).prop(
    "displayName",
    $().designType("string")
      .tags("string")
      .annotate("db.ignore", true)
      .optional()
      .$type
  )
  .annotate("db.table", "profiles")

$("object", NoTableAnnotation)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  )

$("object", ActiveUsersView)
  .prop(
    "id",
    $()
      .refTo(UsersTable, ["id"])
      .$type
  ).prop(
    "name",
    $()
      .refTo(UsersTable, ["name"])
      .$type
  ).prop(
    "email",
    $()
      .refTo(UsersTable, ["email"])
      .$type
  )
  .annotate("db.view", "active_users")
  .annotate("db.view.for", UsersTable)
  .annotate("db.view.filter", )

$("object", LegacyReportView)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "total",
    $().designType("number")
      .tags("number")
      .$type
  )
  .annotate("db.view", "legacy_report")

$("object", RenamedTable)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("db.table", "app_users")
  .annotate("db.table.renamed", "old_users")

$("object", RenamedView)
  .prop(
    "id",
    $()
      .refTo(UsersTable, ["id"])
      .$type
  ).prop(
    "name",
    $()
      .refTo(UsersTable, ["name"])
      .$type
  )
  .annotate("db.view", "premium_users")
  .annotate("db.view.renamed", "vip_users")
  .annotate("db.view.for", UsersTable)
  .annotate("db.view.filter", )

// prettier-ignore-end