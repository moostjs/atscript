// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

class TContactType {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "TContactType"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Address {
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


export class User {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "User"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("union", TContactType)
  .item($()
      .designType("string")
      .value("phone")
      .$type)
  .item($()
      .designType("string")
      .value("email")
      .$type)

$("object", Address)
  .prop(
    "line1",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "line2",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "city",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "state",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "zip",
    $().designType("string")
      .tags("string")
      .$type
  )

$("object", Contact)
  .prop(
    "type",
    $()
      .refTo(TContactType)
      .$type
  ).prop(
    "value",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "label",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  )

$("object", User)
  .prop(
    "firstName",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "lastName",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "address",
    $()
      .refTo(Address)
      .$type
  ).prop(
    "contacts",
    $("array")
      .of($()
          .refTo(Contact)
          .$type)
      .$type
  )

// prettier-ignore-end