// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"
import { Base, Helper } from "./extends-dedup-base.as"

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
  .prop("payload", $f(Base, "payload"))
  .prop("own", $().ref(Helper).$type)

// prettier-ignore-end