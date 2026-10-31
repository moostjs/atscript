// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $blk as $blk, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

export class MyInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "MyInterface"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
const $R = [0, "@atscript/typescript:test/fixtures/annotate-mutating.as"]
$("object", MyInterface)
  .prop("name", $().designType("string")
    .tags("string").annotate("label", "Original Name").$type)
  .prop("age", $().designType("number")
    .tags("number").$type)
  .prop("email", $().designType("string")
    .tags("email", "string").annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true).$type)
  .prop("address", $("object")
    .prop("street", $().designType("string")
      .tags("string").$type)
    .prop("city", $().designType("string")
      .tags("string").$type).$type)

$blk($R, 0, MyInterface, [
  [[["meta.description", "Mutated Interface"]], []],
  [[["label", "Mutated Name"], ["mul", 42, 1]], [["name", 0]]],
  [[["label", "Mutated Age"]], [["age", 0]]],
  [[["label", "Mutated City"]], [["address", 0], ["city", 0]]],
])

// prettier-ignore-end