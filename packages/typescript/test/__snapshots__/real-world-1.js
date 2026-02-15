// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

class Address {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @ts.buildJsonSchema annotation to individual interfaces.")
  }
}


class Contact {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @ts.buildJsonSchema annotation to individual interfaces.")
  }
}


export class Entity {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @ts.buildJsonSchema annotation to individual interfaces.")
  }
}

$("object", Address)
  .prop(
    "line1",
    $().designType("string")
      .tags("string")
      .annotate("label", "Address Line 1")
      .$type
  ).prop(
    "line2",
    $().designType("string")
      .tags("string")
      .annotate("label", "Address Line 2")
      .optional()
      .$type
  ).prop(
    "city",
    $().designType("string")
      .tags("string")
      .annotate("label", "City")
      .$type
  ).prop(
    "state",
    $().designType("string")
      .tags("string")
      .annotate("label", "State")
      .$type
  ).prop(
    "zip",
    $().designType("string")
      .tags("string")
      .annotate("label", "Zip")
      .$type
  )
  .annotate("label", "Address")

$("object", Contact)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "type",
    $("union")
      .item($()
          .designType("string")
          .value("phone")
          .$type)
      .item($()
          .designType("string")
          .value("email")
          .$type)
      .$type
  ).prop(
    "value",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("label", "Contact")

$("object", Entity)
  .prop(
    "id",
    $().designType("string")
      .tags("string")
      .annotate("label", "Legal ID")
      .$type
  ).prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Name")
      .$type
  ).prop(
    "address",
    $()
      .refTo(Address)
      .annotate("label", "Address")
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

// prettier-ignore-end