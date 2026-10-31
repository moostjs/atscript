// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

class Address {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Address"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class Contact {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Contact"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Entity {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Entity"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", Address).annotate("label", "Address")
  .prop("line1", $().designType("string")
    .tags("string").annotate("label", "Address Line 1").$type)
  .prop("line2", $().designType("string")
    .tags("string").annotate("label", "Address Line 2").optional().$type)
  .prop("city", $().designType("string")
    .tags("string").annotate("label", "City").$type)
  .prop("state", $().designType("string")
    .tags("string").annotate("label", "State").$type)
  .prop("zip", $().designType("string")
    .tags("string").annotate("label", "Zip").$type)

$("object", Contact).annotate("label", "Contact")
  .prop("name", $().designType("string")
    .tags("string").$type)
  .prop("type", $("union")
    .item($()
      .designType("string")
      .value("phone").$type)
    .item($()
      .designType("string")
      .value("email").$type).$type)
  .prop("value", $().designType("string")
    .tags("string").$type)

$("object", Entity)
  .prop("id", $().designType("string")
    .tags("string").annotate("label", "Legal ID").$type)
  .prop("name", $().designType("string")
    .tags("string").annotate("label", "Name").$type)
  .prop("address", $().ref(Address).$type)
  .prop("contacts", $("array").of($().ref(Contact).$type).annotate("label", "Contacts").$type)

// prettier-ignore-end