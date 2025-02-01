import { defineAnnotatedType as $ } from "@anscript/typescript"

export class TPrimitive {}
$("", TPrimitive)
  .designType("string")
  .type(String)


export class TPirmiitiveUn {}
$("union", TPirmiitiveUn)
  .item($()
      .designType("string")
      .type(String)
      .$type)
  .item($()
      .designType("number")
      .type(Number)
      .$type)


export class TLiteral {}
$("", TLiteral)
  .designType("string")
  .type(String)
  .value("value")


export class TNumber {}
$("", TNumber)
  .designType("number")
  .type(Number)
  .value(5)


export class TTuple1 {}
$("tuple", TTuple1)
  .item($()
      .designType("string")
      .type(String)
      .$type)


export class TTuple2 {}
$("tuple", TTuple2)
  .item($()
      .designType("string")
      .type(String)
      .$type)
  .item($()
      .designType("string")
      .type(String)
      .$type)


export class TTupleArray {}
$("array", TTupleArray)
  .of($("tuple")
      .item($()
          .designType("string")
          .type(String)
          .$type)
      .item($()
          .designType("string")
          .type(String)
          .$type)
      .$type)


export class TArray {}
$("array", TArray)
  .of($()
      .designType("string")
      .type(String)
      .$type)


export class TArray2 {}
$("array", TArray2)
  .of($("array")
      .of($()
          .designType("string")
          .type(String)
          .$type)
      .$type)


export class TArray3 {}
$("array", TArray3)
  .of($("array")
      .of($("array")
          .of($()
              .designType("string")
              .type(String)
              .$type)
          .$type)
      .$type)


export class TComplexArray {}
$("array", TComplexArray)
  .of($("union")
      .item($()
          .designType("string")
          .type(String)
          .$type)
      .item($()
          .designType("number")
          .type(Number)
          .$type)
      .$type)


export class TComplexArray2 {}
$("array", TComplexArray2)
  .of($("array")
      .of($("union")
          .item($()
              .designType("string")
              .type(String)
              .$type)
          .item($()
              .designType("number")
              .type(Number)
              .$type)
          .$type)
      .$type)


export class TComplexArray3 {}
$("array", TComplexArray3)
  .of($("array")
      .of($("array")
          .of($("union")
              .item($()
                  .designType("string")
                  .type(String)
                  .$type)
              .item($()
                  .designType("number")
                  .type(Number)
                  .$type)
              .$type)
          .$type)
      .$type)


export class TComplexArray4 {}
$("union", TComplexArray4)
  .item($()
      .designType("string")
      .type(String)
      .$type)
  .item($("array")
      .of($()
          .designType("number")
          .type(Number)
          .$type)
      .$type)


export class TComplexArray5 {}
$("union", TComplexArray5)
  .item($("array")
      .of($()
          .designType("string")
          .type(String)
          .$type)
      .$type)
  .item($()
      .designType("number")
      .type(Number)
      .$type)


export class TObject {}
$("object", TObject)
  .prop(
    "prop1",
    $()
      .designType("string")
      .type(String)
      .$type
  ).prop(
    "prop2",
    $()
      .designType("number")
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
          .type(Boolean)
          .$type
      ).prop(
        "prop4",
        $()
          .designType("boolean")
          .type(Boolean)
          .optional()
          .$type
      )
      .$type
  )


export class TObjectUnion1 {}
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
      .type(String)
      .$type)


export class TObjectUnion2 {}
$("union", TObjectUnion2)
  .item($()
      .designType("string")
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


export class TObjectIntersection {}
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
