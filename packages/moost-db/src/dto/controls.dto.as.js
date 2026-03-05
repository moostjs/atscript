// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class QueryControlsDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "QueryControlsDto"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class PagesControlsDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "PagesControlsDto"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class GetOneControlsDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "GetOneControlsDto"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class WithRelationDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "WithRelationDto"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class WithRelationControlsDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "WithRelationControlsDto"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class WithFilterDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "WithFilterDto"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class SortControlDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "SortControlDto"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class SelectControlDto {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "SelectControlDto"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", QueryControlsDto)
  .prop(
    "$skip",
    $().designType("number")
      .tags("positive", "int", "number")
      .annotate("expect.int", true)
      .annotate("expect.min", { minValue: 0,  })
      .optional()
      .$type
  ).prop(
    "$limit",
    $().designType("number")
      .tags("positive", "int", "number")
      .annotate("expect.int", true)
      .annotate("expect.min", { minValue: 0,  })
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
    $("union")
      .item($()
          .refTo(SelectControlDto)
          .$type)
      .item($("array")
          .of($().designType("string")
              .tags("string")
              .$type)
          .$type)
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
  ).prop(
    "$with",
    $("array")
      .of($()
          .refTo(WithRelationDto)
          .$type)
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
    $("union")
      .item($()
          .refTo(SelectControlDto)
          .$type)
      .item($("array")
          .of($().designType("string")
              .tags("string")
              .$type)
          .$type)
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
  ).prop(
    "$with",
    $("array")
      .of($()
          .refTo(WithRelationDto)
          .$type)
      .optional()
      .$type
  )

$("object", GetOneControlsDto)
  .prop(
    "$select",
    $("union")
      .item($()
          .refTo(SelectControlDto)
          .$type)
      .item($("array")
          .of($().designType("string")
              .tags("string")
              .$type)
          .$type)
      .optional()
      .$type
  ).prop(
    "$with",
    $("array")
      .of($()
          .refTo(WithRelationDto)
          .$type)
      .optional()
      .$type
  )

$("object", WithRelationDto)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "filter",
    $()
      .refTo(WithFilterDto)
      .optional()
      .$type
  ).prop(
    "controls",
    $()
      .refTo(WithRelationControlsDto)
      .optional()
      .$type
  ).prop(
    "insights",
    $()
      .refTo(WithFilterDto)
      .optional()
      .$type
  )

$("object", WithRelationControlsDto)
  .prop(
    "$skip",
    $().designType("number")
      .tags("positive", "int", "number")
      .annotate("expect.int", true)
      .annotate("expect.min", { minValue: 0,  })
      .optional()
      .$type
  ).prop(
    "$limit",
    $().designType("number")
      .tags("positive", "int", "number")
      .annotate("expect.int", true)
      .annotate("expect.min", { minValue: 0,  })
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
    $("union")
      .item($()
          .refTo(SelectControlDto)
          .$type)
      .item($("array")
          .of($().designType("string")
              .tags("string")
              .$type)
          .$type)
      .optional()
      .$type
  ).prop(
    "$with",
    $("array")
      .of($()
          .refTo(WithRelationDto)
          .$type)
      .optional()
      .$type
  )

$("object", WithFilterDto)
  .propPattern(
    /./,
    $("union")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($().designType("number")
          .tags("number")
          .$type)
      .item($().designType("boolean")
          .tags("boolean")
          .$type)
      .item($().designType("null")
          .tags("null")
          .$type)
      .item($()
          .refTo(WithFilterDto)
          .$type)
      .item($("array")
          .of($()
              .refTo(WithFilterDto)
              .$type)
          .$type)
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