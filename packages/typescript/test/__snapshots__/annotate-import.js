// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $fc as $fc, $alias as $al, $blk as $blk, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"
import { MyInterface } from "./annotate-nonmutating.as"

export class ImportedAnnotated {
  static __is_atscript_annotated_type = true
  static type = null
  static metadata = new Map()
  static id = "ImportedAnnotated"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$al(ImportedAnnotated, MyInterface)
$blk(null, 0, ImportedAnnotated, [
  [[["label", "Imported Name"]], [["name", 2]]],
  [[["label", "Imported City"]], [["address", 2], ["city", 2]]],
])

// prettier-ignore-end