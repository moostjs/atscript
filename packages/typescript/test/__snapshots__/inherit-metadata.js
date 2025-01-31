import { defineAnnotatedType as $ } from "@anscript/typescript/runtime"

class ISource {}
$("object", ISource)
  .prop(
    "firstName",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "First Name")
      .$type
  ).prop(
    "lastName",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "Last Name")
      .$type
  ).prop(
    "age",
    $()
      .designType("number")
      .type(Number)
      .annotate("min", 18)
      .$type
  )


export class ITarget {}
$("object", ITarget)
  .prop(
    "firstName",
    $("ref")
      .refTo(ISource, ["firstName"])
      .$type
  ).prop(
    "lastName",
    $("ref")
      .refTo(ISource, ["lastName"])
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .$type
  ).prop(
    "age",
    $("ref")
      .refTo(ISource, ["age"])
      .$type
  )
