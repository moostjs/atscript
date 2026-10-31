// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"
import { Grand } from "./extends-grand-grand.as"
import { Mid } from "./extends-grand-mid.as"

export class Child {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Child"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", Child)
  .prop("g", $f(Grand, "g"))
  .prop("m", $f(Mid, "m"))
  .prop("c", $().designType("string")
    .tags("string").$type)

// prettier-ignore-end