import { defineAnnotatedType as $ } from "@anscript/typescript"

class ISource {}
$("object", ISource)
  .prop(
    "firstName",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .annotate("label", "First Name")
      .$type
  ).prop(
    "lastName",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .annotate("label", "Last Name")
      .$type
  ).prop(
    "age",
    $()
      .designType("number")
      .flags("number")
      .type(Number)
      .annotate("min", 18)
      .$type
  )


export class ITarget {}
$("object", ITarget)
  .prop(
    "firstName",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .$type
  ).prop(
    "lastName",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .optional()
      .$type
  ).prop(
    "age",
    $()
      .designType("number")
      .flags("number")
      .type(Number)
      .$type
  )
