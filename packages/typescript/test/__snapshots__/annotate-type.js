// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d, $f as $f, $fc as $fc, $alias as $al, $blk as $blk, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

export class TString {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TString"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class TString2 {
  static __is_atscript_annotated_type = true
  static type = null
  static metadata = new Map()
  static id = "TString2"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class TO {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TO"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class TO2 {
  static __is_atscript_annotated_type = true
  static type = null
  static metadata = new Map()
  static id = "TO2"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
const $R = [0, "@atscript/typescript:test/fixtures/annotate-type.as"]
$("union", TString)
  .item($().designType("string")
    .tags("string").$type)
  .item($().designType("number")
    .tags("number").$type)

$al(TString2, TString)
$a(TString2.metadata, "meta.label", "Labeled String 2")

$("union", TO)
  .item($("object")
    .prop("name", $().designType("string")
      .tags("string").$type)
    .prop("age", $().designType("number")
      .tags("number").$type).$type)
  .item($("object")
    .prop("kind", $("union")
      .item($()
        .designType("string")
        .value("abc").$type)
      .item($()
        .designType("string")
        .value("def").$type).$type).$type)

$al(TO2, TO)
$blk(null, 0, TO2, [
  [[["meta.label", "Age"]], [["|0", 2], ["age", 2]]],
  [[["meta.label", "Kind"]], [["|1", 2], ["kind", 2]]],
])

$blk($R, 0, TString, [
  [[["meta.label", "Labeled String"]], []],
])

$blk($R, 1, TO, [
  [[["meta.description", "Mutated Descr"]], []],
  [[["meta.description", "Mutated Descr Age"]], [["|0", 0], ["age", 0]]],
  [[["meta.description", "Mutated Descr Kind"]], [["|1", 0], ["kind", 0]]],
])

// prettier-ignore-end