// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

export class PlaygroundForm {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


class Address {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


class Contact {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


class MyString {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
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