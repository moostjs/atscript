import { defineAnnotatedType as $ } from "@anscript/typescript/runtime"

export class WithMetadata {}
$("object", WithMetadata)
  .prop(
    "prop1",
    $()
      .designType("string")
      .type(String)
      .annotate("label", "Prop1")
      .$type
  ).prop(
    "prop-2",
    $()
      .designType("number")
      .type(Number)
      .annotate("long.nested.name", "Prop-2")
      .annotate("long.nested.name2", "Prop-2-2")
      .$type
  ).prop(
    "obj",
    $("object")
      .prop(
        "prop3",
        $()
          .designType("string")
          .type(String)
          .annotate("label", "Prop3")
          .$type
      ).prop(
        "prop4",
        $()
          .designType("string")
          .type(String)
          .annotate("label", "Prop4")
          .$type
      ).prop(
        "nested2",
        $("object")
          .prop(
            "nested3",
            $("object")
              .prop(
                "a",
                $()
                  .designType("number")
                  .type(Number)
                  .$type
              ).prop(
                "b",
                $()
                  .designType("string")
                  .type(String)
                  .$type
              ).prop(
                "d",
                $()
                  .designType("boolean")
                  .type(Boolean)
                  .$type
              ).prop(
                "e",
                $()
                  .designType("null")
                  .type(Object)
                  .$type
              ).prop(
                "f",
                $()
                  .designType("undefined")
                  .type(undefined)
                  .$type
              )
              .$type
          )
          .$type
      )
      .annotate("nested", true)
      .$type
  )
  .annotate("id", "interface-with-metadata")
  .annotate("long.nested.name", "WithMetadata")
  .annotate("bool.flag", true)
