import { defineAnnotatedType as $ } from "@anscript/typescript"

class TContactType {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class Address {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class Contact {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class User {
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
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
      .flags("string")
      .$type
  ).prop(
    "line2",
    $().designType("string")
      .flags("string")
      .$type
  ).prop(
    "city",
    $().designType("string")
      .flags("string")
      .$type
  ).prop(
    "state",
    $().designType("string")
      .flags("string")
      .$type
  ).prop(
    "zip",
    $().designType("string")
      .flags("string")
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
      .flags("string")
      .$type
  ).prop(
    "label",
    $().designType("string")
      .flags("string")
      .optional()
      .$type
  )

$("object", User)
  .prop(
    "firstName",
    $().designType("string")
      .flags("string")
      .$type
  ).prop(
    "lastName",
    $().designType("string")
      .flags("string")
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
