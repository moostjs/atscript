// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

export class QueryControlsDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


export class PagesControlsDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


export class GetOneControlsDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


class SortControlDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


class SelectControlDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}

$("object", QueryControlsDto)
  .prop(
    "$skip",
    $().designType("number")
      .tags("positive", "int", "number")
      .annotate("expect.min", 0)
      .annotate("expect.int", true)
      .optional()
      .$type
  ).prop(
    "$limit",
    $().designType("number")
      .tags("positive", "int", "number")
      .annotate("expect.min", 0)
      .annotate("expect.int", true)
      .optional()
      .$type
  ).prop(
    "$count",
    $().designType("boolean")
      .tags("boolean")
      .optional()
      .$type
  ).prop(
    "$sort",
    $()
      .refTo(SortControlDto)
      .optional()
      .$type
  ).prop(
    "$select",
    $()
      .refTo(SelectControlDto)
      .optional()
      .$type
  ).prop(
    "$search",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  ).prop(
    "$index",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  )

$("object", PagesControlsDto)
  .prop(
    "$page",
    $().designType("string")
      .tags("string")
      .annotate("expect.pattern", { pattern: "^\\d+$",  flags: "u",  message: "Expected positive number" }, true)
      .optional()
      .$type
  ).prop(
    "$size",
    $().designType("string")
      .tags("string")
      .annotate("expect.pattern", { pattern: "^\\d+$",  flags: "u",  message: "Expected positive number" }, true)
      .optional()
      .$type
  ).prop(
    "$sort",
    $()
      .refTo(SortControlDto)
      .optional()
      .$type
  ).prop(
    "$select",
    $()
      .refTo(SelectControlDto)
      .optional()
      .$type
  ).prop(
    "$search",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  ).prop(
    "$index",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  )

$("object", GetOneControlsDto)
  .prop(
    "$select",
    $()
      .refTo(SelectControlDto)
      .optional()
      .$type
  )

$("object", SortControlDto)
  .propPattern(
    /./,
    $("union")
      .item($()
          .designType("number")
          .value(1)
          .$type)
      .item($()
          .designType("number")
          .value(-1)
          .$type)
      .$type
  )

$("object", SelectControlDto)
  .propPattern(
    /./,
    $("union")
      .item($()
          .designType("number")
          .value(1)
          .$type)
      .item($()
          .designType("number")
          .value(0)
          .$type)
      .$type
  )

// prettier-ignore-end