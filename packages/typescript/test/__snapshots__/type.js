import { defineAnnotatedType as $ } from "@anscript/typescript/runtime"

export class TPrimitive {}
$("", TPrimitive)
  .designType("string")
  .type(String)


export class TPirmiitiveUn {}
$("union", TPirmiitiveUn)
  .item($()
      .designType("string")
      .type(String)
      .$def)
  .item($()
      .designType("number")
      .type(Number)
      .$def)


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
      .$def)


export class TTuple2 {}
$("tuple", TTuple2)
  .item($()
      .designType("string")
      .type(String)
      .$def)
  .item($()
      .designType("string")
      .type(String)
      .$def)


export class TTupleArray {}
$("array", TTupleArray)
  .of($("tuple")
      .item($()
          .designType("string")
          .type(String)
          .$def)
      .item($()
          .designType("string")
          .type(String)
          .$def)
      .$def)


export class TArray {}
$("array", TArray)
  .of($()
      .designType("string")
      .type(String)
      .$def)


export class TArray2 {}
$("array", TArray2)
  .of($("array")
      .of($()
          .designType("string")
          .type(String)
          .$def)
      .$def)


export class TArray3 {}
$("array", TArray3)
  .of($("array")
      .of($("array")
          .of($()
              .designType("string")
              .type(String)
              .$def)
          .$def)
      .$def)


export class TComplexArray {}
$("array", TComplexArray)
  .of($("union")
      .item($()
          .designType("string")
          .type(String)
          .$def)
      .item($()
          .designType("number")
          .type(Number)
          .$def)
      .$def)


export class TComplexArray2 {}
$("array", TComplexArray2)
  .of($("array")
      .of($("union")
          .item($()
              .designType("string")
              .type(String)
              .$def)
          .item($()
              .designType("number")
              .type(Number)
              .$def)
          .$def)
      .$def)


export class TComplexArray3 {}
$("array", TComplexArray3)
  .of($("array")
      .of($("array")
          .of($("union")
              .item($()
                  .designType("string")
                  .type(String)
                  .$def)
              .item($()
                  .designType("number")
                  .type(Number)
                  .$def)
              .$def)
          .$def)
      .$def)


export class TComplexArray4 {}
$("union", TComplexArray4)
  .item($()
      .designType("string")
      .type(String)
      .$def)
  .item($("array")
      .of($()
          .designType("number")
          .type(Number)
          .$def)
      .$def)


export class TComplexArray5 {}
$("union", TComplexArray5)
  .item($("array")
      .of($()
          .designType("string")
          .type(String)
          .$def)
      .$def)
  .item($()
      .designType("number")
      .type(Number)
      .$def)


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
      .$def)
  .item($()
      .designType("string")
      .type(String)
      .$def)


export class TObjectUnion2 {}
$("union", TObjectUnion2)
  .item($()
      .designType("string")
      .type(String)
      .$def)
  .item($("object")
      .prop(
        "a",
        $()
          .designType("string")
          .type(String)
          .value("a")
          .$type
      )
      .$def)


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
      .$def)
  .item($("object")
      .prop(
        "b",
        $()
          .designType("string")
          .type(String)
          .value("b")
          .$type
      )
      .$def)
