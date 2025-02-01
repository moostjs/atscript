import { defineAnnotatedType as $ } from "@anscript/typescript"

class Address {}
$("object", Address)
  .prop(
    "line1",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "Address Line 1")
      .$type
  ).prop(
    "line2",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "Address Line 2")
      .optional()
      .$type
  ).prop(
    "city",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "City")
      .$type
  ).prop(
    "state",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "State")
      .$type
  ).prop(
    "zip",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "Zip")
      .$type
  )
  .annotate("label", "Address")


class Contact {}
$("object", Contact)
  .prop(
    "name",
    $()
      .designType("string")
      .type(String)
      .$type
  ).prop(
    "type",
    $("union")
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
      .$type
  ).prop(
    "value",
    $()
      .designType("string")
      .type(String)
      .$type
  )
  .annotate("label", "Contact")


export class Entity {}
$("object", Entity)
  .prop(
    "id",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "Legal ID")
      .$type
  ).prop(
    "name",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "Name")
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
      .annotate("label", "Contacts")
      .$type
  )
