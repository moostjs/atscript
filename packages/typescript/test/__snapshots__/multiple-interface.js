// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"

class TContactType {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class Address {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


class Contact {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class User {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
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