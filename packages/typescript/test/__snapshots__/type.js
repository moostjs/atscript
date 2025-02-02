import { defineAnnotatedType as $ } from "@anscript/typescript"

export class TPrimitive{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TPirmiitiveUn{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TLiteral{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TNumber{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TTuple1{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TTuple2{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TTupleArray{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TArray{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TArray2{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TArray3{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TComplexArray{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TComplexArray2{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TComplexArray3{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TComplexArray4{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TComplexArray5{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TObject{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TObjectUnion1{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TObjectUnion2{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class TObjectIntersection{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("", TPrimitive)
  .designType("string")
  .flags("string")
  .type(String)

$("union", TPirmiitiveUn)
  .item($()
      .designType("string")
      .flags("string")
      .type(String)
      .$type)
  .item($()
      .designType("number")
      .flags("number")
      .type(Number)
      .$type)

$("", TLiteral)
  .designType("string")
  .type(String)
  .value("value")

$("", TNumber)
  .designType("number")
  .type(Number)
  .value(5)

$("tuple", TTuple1)
  .item($()
      .designType("string")
      .flags("string")
      .type(String)
      .$type)

$("tuple", TTuple2)
  .item($()
      .designType("string")
      .flags("string")
      .type(String)
      .$type)
  .item($()
      .designType("string")
      .flags("string")
      .type(String)
      .$type)

$("array", TTupleArray)
  .of($("tuple")
      .item($()
          .designType("string")
          .flags("string")
          .type(String)
          .$type)
      .item($()
          .designType("string")
          .flags("string")
          .type(String)
          .$type)
      .$type)

$("array", TArray)
  .of($()
      .designType("string")
      .flags("string")
      .type(String)
      .$type)

$("array", TArray2)
  .of($("array")
      .of($()
          .designType("string")
          .flags("string")
          .type(String)
          .$type)
      .$type)

$("array", TArray3)
  .of($("array")
      .of($("array")
          .of($()
              .designType("string")
              .flags("string")
              .type(String)
              .$type)
          .$type)
      .$type)

$("array", TComplexArray)
  .of($("union")
      .item($()
          .designType("string")
          .flags("string")
          .type(String)
          .$type)
      .item($()
          .designType("number")
          .flags("number")
          .type(Number)
          .$type)
      .$type)

$("array", TComplexArray2)
  .of($("array")
      .of($("union")
          .item($()
              .designType("string")
              .flags("string")
              .type(String)
              .$type)
          .item($()
              .designType("number")
              .flags("number")
              .type(Number)
              .$type)
          .$type)
      .$type)

$("array", TComplexArray3)
  .of($("array")
      .of($("array")
          .of($("union")
              .item($()
                  .designType("string")
                  .flags("string")
                  .type(String)
                  .$type)
              .item($()
                  .designType("number")
                  .flags("number")
                  .type(Number)
                  .$type)
              .$type)
          .$type)
      .$type)

$("union", TComplexArray4)
  .item($()
      .designType("string")
      .flags("string")
      .type(String)
      .$type)
  .item($("array")
      .of($()
          .designType("number")
          .flags("number")
          .type(Number)
          .$type)
      .$type)

$("union", TComplexArray5)
  .item($("array")
      .of($()
          .designType("string")
          .flags("string")
          .type(String)
          .$type)
      .$type)
  .item($()
      .designType("number")
      .flags("number")
      .type(Number)
      .$type)

$("object", TObject)
  .prop(
    "prop1",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "prop2",
    $()
      .designType("number")
      .flags("number")
      .type(Number)
      .optional()
      .$type
  ).prop(
    "nested",
    $("object")
      .prop(
        "prop3",
        $()
          .designType("boolean")
          .flags("boolean")
          .type(Boolean)
          .$type
      ).prop(
        "prop4",
        $()
          .designType("boolean")
          .flags("boolean")
          .type(Boolean)
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
          .type(String)
          .value("a")
          .$type
      )
      .$type)
  .item($()
      .designType("string")
      .flags("string")
      .type(String)
      .$type)

$("union", TObjectUnion2)
  .item($()
      .designType("string")
      .flags("string")
      .type(String)
      .$type)
  .item($("object")
      .prop(
        "a",
        $()
          .designType("string")
          .type(String)
          .value("a")
          .$type
      )
      .$type)

$("intersection", TObjectIntersection)
  .item($("object")
      .prop(
        "a",
        $()
          .designType("string")
          .type(String)
          .value("a")
          .$type
      )
      .$type)
  .item($("object")
      .prop(
        "b",
        $()
          .designType("string")
          .type(String)
          .value("b")
          .$type
      )
      .$type)
