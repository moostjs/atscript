// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

export class PlaygroundForm {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "PlaygroundForm"
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


class Contact {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Contact"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class MyString {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "MyString"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("", MyString).designType("string")
  .tags("string").annotate("label", "My String Label")

$("object", PlaygroundForm).annotate("label", "Playground Form")
  .prop("addresses", $("array").of($("union")
      .item($().ref(Address).$type)
      .item($().ref(Contact).$type)
      .item($().ref(MyString).$type).$type).annotate("label", "Addresses /Contacts").$type)

$("object", Address).annotate("label", "Address")
  .prop("type", $()
    .designType("string")
    .value("address").$type)
  .prop("street", $().designType("string")
    .tags("string").$type)
  .prop("city", $().designType("string")
    .tags("string").$type)

$("object", Contact).annotate("label", "Contact")
  .prop("type", $()
    .designType("string")
    .value("phone").$type)
  .prop("email", $().designType("string")
    .tags("string").$type)
  .prop("phone", $().designType("string")
    .tags("string").$type)

// prettier-ignore-end