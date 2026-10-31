// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

class TFirstName {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TFirstName"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class TLastName {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TLastName"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class TAge {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TAge"
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
$("", TFirstName).designType("string")
  .tags("string").annotate("label", "First Name")

$("", TLastName).designType("string")
  .tags("string").annotate("label", "Last Name")

$("", TAge).designType("number")
  .tags("number").annotate("min", 18)

$("object", ITarget)
  .prop("firstName", $().ref(TFirstName).$type)
  .prop("lastName", $().ref(TLastName).annotate("label", "Last Name (optional)").annotate("required", false).optional().$type)
  .prop("age", $().ref(TAge).$type)

// prettier-ignore-end