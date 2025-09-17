// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"

export class TPrimitive {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TPirmiitiveUn {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TLiteral {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TNumber {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TTuple1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TTuple2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TTupleArray {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TArray {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TArray2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TArray3 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TComplexArray {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TComplexArray2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TComplexArray3 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TComplexArray4 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TComplexArray5 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TObject {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TObjectUnion1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TObjectUnion2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TObjectIntersection {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static _jsonSchema
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}

$("", TPrimitive).designType("string")
  .tags("string")

$("union", TPirmiitiveUn)
  .item($().designType("string")
      .tags("string")
      .$type)
  .item($().designType("number")
      .tags("number")
      .$type)

$("", TLiteral)
  .designType("string")
  .value("value")

$("", TNumber)
  .designType("number")
  .value(5)

$("tuple", TTuple1)
  .item($().designType("string")
      .tags("string")
      .$type)

$("tuple", TTuple2)
  .item($().designType("string")
      .tags("string")
      .$type)
  .item($().designType("string")
      .tags("string")
      .$type)

$("array", TTupleArray)
  .of($("tuple")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($().designType("string")
          .tags("string")
          .$type)
      .$type)

$("array", TArray)
  .of($().designType("string")
      .tags("string")
      .$type)

$("array", TArray2)
  .of($("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .$type)

$("array", TArray3)
  .of($("array")
      .of($("array")
          .of($().designType("string")
              .tags("string")
              .$type)
          .$type)
      .$type)

$("array", TComplexArray)
  .of($("union")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($().designType("number")
          .tags("number")
          .$type)
      .$type)

$("array", TComplexArray2)
  .of($("array")
      .of($("union")
          .item($().designType("string")
              .tags("string")
              .$type)
          .item($().designType("number")
              .tags("number")
              .$type)
          .$type)
      .$type)

$("array", TComplexArray3)
  .of($("array")
      .of($("array")
          .of($("union")
              .item($().designType("string")
                  .tags("string")
                  .$type)
              .item($().designType("number")
                  .tags("number")
                  .$type)
              .$type)
          .$type)
      .$type)

$("union", TComplexArray4)
  .item($().designType("string")
      .tags("string")
      .$type)
  .item($("array")
      .of($().designType("number")
          .tags("number")
          .$type)
      .$type)

$("union", TComplexArray5)
  .item($("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .$type)
  .item($().designType("number")
      .tags("number")
      .$type)

$("object", TObject)
  .prop(
    "prop1",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "prop2",
    $().designType("number")
      .tags("number")
      .optional()
      .$type
  ).prop(
    "nested",
    $("object")
      .prop(
        "prop3",
        $().designType("boolean")
          .tags("boolean")
          .$type
      ).prop(
        "prop4",
        $().designType("boolean")
          .tags("boolean")
          .optional()
          .$type
      )
      .$type
  )

$("union", TObjectUnion1)
  .item($("object")
      .prop(
        "a",
        $()
          .designType("string")
          .value("a")
          .$type
      )
      .$type)
  .item($().designType("string")
      .tags("string")
      .$type)

$("union", TObjectUnion2)
  .item($().designType("string")
      .tags("string")
      .$type)
  .item($("object")
      .prop(
        "a",
        $()
          .designType("string")
          .value("a")
          .$type
      )
      .$type)

$("object", TObjectIntersection)
  .prop(
    "a",
    $()
      .designType("string")
      .value("a")
      .$type
  ).prop(
    "b",
    $()
      .designType("string")
      .value("b")
      .$type
  )

// prettier-ignore-end