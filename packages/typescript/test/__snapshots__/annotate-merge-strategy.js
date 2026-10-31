// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d, $f as $f, $fc as $fc, $alias as $al, $blk as $blk, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

export class User {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "User"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class User2 {
  static __is_atscript_annotated_type = true
  static type = null
  static metadata = new Map()
  static id = "User2"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
const $R = [0, "@atscript/typescript:test/fixtures/annotate-merge-strategy.as"]
$("object", User).annotate("mulAppend", "top-original", true)
  .prop("name", $().designType("string")
    .tags("string").annotate("label", "Original Name").annotate("mulAppend", "prop-original", true).annotate("mul", 1, true).annotate("mul", 2, true).$type)

$al(User2, User)
$a(User2.metadata, "mulAppend", "top-aliased", true)
$blk(null, 0, User2, [
  [[["label", "Aliased Name"], ["mulAppend", "prop-aliased", 1], ["mul", 77, 1]], [["name", 2]]],
])

$blk($R, 0, User, [
  [[["mulAppend", "top-mutated", 1]], []],
  [[["label", "Mutated Name"], ["mulAppend", "prop-mutated", 1], ["mul", 99, 1]], [["name", 0]]],
])

// prettier-ignore-end