// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $ft as $ft, $alias as $al, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

class IA {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "IA"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class IB {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "IB"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class T {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "T"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class I1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "I1"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", IA).annotate("label", "IA")
  .prop("a", $().designType("string")
    .tags("string").annotate("label", "a from IA").$type)
  .prop("b", $().designType("number")
    .tags("number").annotate("ia", true).annotate("label", "b from IA").optional().$type)

$("object", IB).annotate("label", "IB")
  .prop("b", $().designType("number")
    .tags("number").annotate("ib", true).annotate("label", "b from IB").$type)
  .prop("c", $().designType("string")
    .tags("string").annotate("label", "c from IB").annotate("ib", true).optional().$type)

$("object", T).over([IB, IA], true).annotate("Tlabel", "T")
  .prop("a", $f(IA, "a"))
  .prop("b", $().designType("number")
    .tags("number").over([$f(IB, "b"), $f(IA, "b")]).$type)
  .prop("c", $f(IB, "c"))

$("object", I1)
  .prop("all", $().ref(T).$type)
  .prop("a", $().$type)
  .prop("b", $().$type)
  .prop("c", $().$type)

$al($f(I1, "a"), T, ["a"])

$al($f(I1, "b"), T, ["b"])

$al($f(I1, "c"), T, ["c"])

// prettier-ignore-end