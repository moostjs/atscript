// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d, $f as $f, $ft as $ft, $fc as $fc, $alias as $al, $blk as $blk, $sh as $sh, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

class Contact {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Contact"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class Address {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Address"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Deep {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Deep"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class AliasedDeep {
  static __is_atscript_annotated_type = true
  static type = null
  static metadata = new Map()
  static id = "AliasedDeep"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
const $R = [0, "@atscript/typescript:test/fixtures/annotate-deep-ref.as"]
$("object", Contact)
  .prop("phone", $().designType("string")
    .tags("string").annotate("label", "Phone").$type)
  .prop("email", $().designType("string")
    .tags("email", "string").annotate("label", "Email").annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true).$type)

$("object", Address)
  .prop("street", $().designType("string")
    .tags("string").annotate("label", "Street").$type)
  .prop("contact", $().ref(Contact).$type)

$("object", Deep)
  .prop("name", $().designType("string")
    .tags("string").annotate("label", "Name").$type)
  .prop("address", $().ref(Address).$type)

$sh(Deep, [[["address", 0], ["contact", 2]]])

$sh(Deep, [[["address", 0], ["contact", 2], ["phone", 2]]])

$al(AliasedDeep, Deep)
$a(AliasedDeep.metadata, "meta.description", "Aliased Deep")
$blk(null, 0, AliasedDeep, [
  [[["label", "Work Phone"]], [["address", 2], ["contact", 2], ["phone", 2]]],
])

$blk($R, 0, Deep, [
  [[["meta.description", "Mutated Deep"]], []],
  [[["label", "Mobile Phone"]], [["address", 0], ["contact", 2], ["phone", 2]]],
])

// prettier-ignore-end