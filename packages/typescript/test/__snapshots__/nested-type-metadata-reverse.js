// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

export class ExplorationForm {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ExplorationForm"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class TAddress {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TAddress"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", ExplorationForm)
  .prop("name", $().designType("string")
    .tags("string").annotate("label", "Name").$type)
  .prop("addresses", $("array").of($().ref(TAddress).$type).annotate("label", "Addresses").$type)

$("object", TAddress).annotate("label", "Address")
  .prop("street", $().designType("string")
    .tags("string").annotate("label", "Street").$type)
  .prop("city", $().designType("string")
    .tags("string").annotate("label", "City").$type)

// prettier-ignore-end