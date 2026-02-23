// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

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

$("object", PlaygroundForm)
  .prop(
    "addresses",
    $("array")
      .of($("union")
          .item($()
              .refTo(Address)
              .annotate("label", "Address")
              .$type)
          .item($()
              .refTo(Contact)
              .annotate("label", "Contact")
              .$type)
          .item($()
              .refTo(MyString)
              .annotate("label", "My String Label")
              .$type)
          .$type)
      .annotate("label", "Addresses /Contacts")
      .$type
  )
  .annotate("label", "Playground Form")

$("object", Address)
  .prop(
    "type",
    $()
      .designType("string")
      .value("address")
      .$type
  ).prop(
    "street",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "city",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("label", "Address")

$("object", Contact)
  .prop(
    "type",
    $()
      .designType("string")
      .value("phone")
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "phone",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("label", "Contact")

$("", MyString).designType("string")
  .tags("string")
  .annotate("label", "My String Label")

// prettier-ignore-end