import { defineAnnotatedType as $ } from "@anscript/typescript/runtime"

class TFirstName {}
$("", TFirstName)
  .designType("string")
  .type(String)
  .annotate("label", "First Name")


class TLastName {}
$("", TLastName)
  .designType("string")
  .type(String)
  .annotate("label", "Last Name")


class TAge {}
$("", TAge)
  .designType("number")
  .type(Number)
  .annotate("min", 18)


export class ITarget {}
$("object", ITarget)
  .prop(
    "firstName",
    $("ref")
      .refTo(TFirstName)
      .$type
  ).prop(
    "lastName",
    $("ref")
      .refTo(TLastName)
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .$type
  ).prop(
    "age",
    $("ref")
      .refTo(TAge)
      .$type
  )
