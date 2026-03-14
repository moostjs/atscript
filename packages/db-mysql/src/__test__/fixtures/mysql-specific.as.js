// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class MysqlSpecificTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "MysqlSpecificTable"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", MysqlSpecificTable)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", true)
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("int", "number")
      .annotate("db.mysql.unsigned", true)
      .annotate("expect.int", true)
      .$type
  ).prop(
    "bio",
    $().designType("string")
      .tags("string")
      .annotate("db.mysql.type", "MEDIUMTEXT")
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("expect.maxLength", { length: 200,  })
      .$type
  ).prop(
    "updatedAt",
    $().designType("number")
      .tags("timestamp", "number")
      .annotate("db.mysql.onUpdate", "CURRENT_TIMESTAMP")
      .annotate("db.default.now", true)
      .annotate("expect.int", true)
      .$type
  )
  .annotate("db.table", true)
  .annotate("db.mysql.engine", "InnoDB")
  .annotate("db.mysql.charset", "utf8mb4")
  .annotate("db.mysql.collate", "utf8mb4_unicode_ci")

// prettier-ignore-end