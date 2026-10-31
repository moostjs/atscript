// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"
import { Base } from "./extends-fallback-base.as"

export class Helper {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Helper"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Helper_1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Helper_1"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


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
$("object", Helper)
  .prop("fromChild", $().designType("number")
    .tags("number").$type)

$("object", Helper_1)
  .prop("alsoFromChild", $().designType("boolean")
    .tags("boolean").$type)

$("object", Child)
  .prop("payload", $f(Base, "payload"))
  .prop("a", $().ref(Helper).$type)
  .prop("b", $().ref(Helper_1).$type)

// prettier-ignore-end