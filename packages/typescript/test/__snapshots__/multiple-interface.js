import { defineAnnotatedType as $ } from "@anscript/typescript"

class TContactType {}
$("union", TContactType)
  .item($()
      .designType("string")
      .type(String)
      .value("phone")
      .$type)
  .item($()
      .designType("string")
      .type(String)
      .value("email")
      .$type)


export class Address {}
$("object", Address)
  .prop(
    "line1",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "line2",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "city",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "state",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "zip",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  )


class Contact {}
$("object", Contact)
  .prop(
    "type",
    $()
      .refTo(TContactType)
      .$type
  ).prop(
    "value",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "label",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .optional()
      .$type
  )


export class User {}
$("object", User)
  .prop(
    "firstName",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "lastName",
    $()
      .designType("string")
      .flags("string")
      .type(String)
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
