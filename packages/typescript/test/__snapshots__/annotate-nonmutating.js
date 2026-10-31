// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d, $f as $f, $fc as $fc, $alias as $al, $blk as $blk, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

export class MyInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "MyInterface"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class AnnotatedInterface {
  static __is_atscript_annotated_type = true
  static type = null
  static metadata = new Map()
  static id = "AnnotatedInterface"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", MyInterface).annotate("meta.description", "Original")
  .prop("name", $().designType("string")
    .tags("string").annotate("label", "Original Name").$type)
  .prop("age", $().designType("number")
    .tags("number").annotate("label", "Original Age").$type)
  .prop("email", $().designType("string")
    .tags("email", "string").annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true).$type)
  .prop("address", $("object")
    .prop("street", $().designType("string")
      .tags("string").annotate("label", "Street").$type)
    .prop("city", $().designType("string")
      .tags("string").$type).$type)

$al(AnnotatedInterface, MyInterface)
$a(AnnotatedInterface.metadata, "meta.description", "Annotated")
$blk(null, 0, AnnotatedInterface, [
  [[["label", "Custom Name"]], [["name", 2]]],
  [[["label", "Custom Age"]], [["age", 2]]],
  [[["label", "Custom Address City"]], [["address", 2], ["city", 2]]],
])

// prettier-ignore-end