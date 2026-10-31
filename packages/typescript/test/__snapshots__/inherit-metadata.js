// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $ft as $ft, $alias as $al, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

class ISource {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ISource"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class ITarget {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ITarget"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", ISource)
  .prop("firstName", $().designType("string")
    .tags("string").annotate("label", "First Name").$type)
  .prop("lastName", $().designType("string")
    .tags("string").annotate("label", "Last Name").$type)
  .prop("age", $().designType("number")
    .tags("number").annotate("min", 18).$type)

$("object", ITarget)
  .prop("firstName", $().$type)
  .prop("lastName", $().annotate("label", "Last Name (optional)").annotate("required", false).optional().$type)
  .prop("age", $().$type)

$al($f(ITarget, "firstName"), ISource, ["firstName"])

$al($f(ITarget, "lastName"), ISource, ["lastName"])

$al($f(ITarget, "age"), ISource, ["age"])

// prettier-ignore-end