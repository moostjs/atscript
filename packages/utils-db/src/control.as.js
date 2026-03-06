// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class AtscriptControl {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "AtscriptControl"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", AtscriptControl)
  .prop(
    "key",
    $().designType("string")
      .tags("string")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "value",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  ).prop(
    "lockedBy",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  ).prop(
    "lockedAt",
    $().designType("number")
      .tags("number")
      .optional()
      .$type
  ).prop(
    "expiresAt",
    $().designType("number")
      .tags("number")
      .optional()
      .$type
  )
  .annotate("db.table", "__atscript_control")

// prettier-ignore-end