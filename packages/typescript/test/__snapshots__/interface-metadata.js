import { defineAnnotatedType as $ } from "@anscript/typescript"

export class WithMetadata{
  static __is_anscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("object", WithMetadata)
  .prop(
    "prop1",
    $()
      .designType("string")
      .flags("string")
      .type(String)
      .annotate("label", "Prop1")
      .$type
  ).prop(
    "prop-2",
    $()
      .refTo(int)
      .annotate("mul", 1, true)
      .annotate("mul", 2, true)
      .annotate("mul", 3, true)
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
          .flags("string")
          .type(String)
          .annotate("label", "Prop3")
          .$type
      ).prop(
        "prop4",
        $()
          .designType("string")
          .flags("string")
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
                  .refTo(float)
                  .$type
              ).prop(
                "b",
                $()
                  .designType("string")
                  .flags("string")
                  .type(String)
                  .$type
              ).prop(
                "d",
                $()
                  .refTo(true)
                  .$type
              ).prop(
                "e",
                $()
                  .designType("null")
                  .flags("null")
                  .type(Object)
                  .$type
              ).prop(
                "f",
                $()
                  .designType("undefined")
                  .flags("undefined")
                  .type(Object)
                  .$type
              )
              .$type
          )
          .annotate("obj", { prop1: "str",  prop2: 123,  prop3: false })
          .$type
      )
      .annotate("nested", true)
      .$type
  )
  .annotate("id", "interface-with-metadata")
  .annotate("long.nested.name", "WithMetadata")
  .annotate("bool.flag", true)
