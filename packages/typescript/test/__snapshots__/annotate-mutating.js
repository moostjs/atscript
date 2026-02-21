// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class MyInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", MyInterface)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Original Name")
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("email", "string")
      .annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true)
      .$type
  ).prop(
    "address",
    $("object")
      .prop(
        "street",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "city",
        $().designType("string")
          .tags("string")
          .$type
      )
      .$type
  )

// Ad-hoc annotations for MyInterface
$a(MyInterface.type.props.get("name")?.metadata, "label", "Mutated Name")
MyInterface.type.props.get("name")?.metadata.delete("mul")
$a(MyInterface.type.props.get("name")?.metadata, "mul", 42, true)
$a(MyInterface.type.props.get("age")?.metadata, "label", "Mutated Age")
$a(MyInterface.type.props.get("address")?.type.props.get("city")?.metadata, "label", "Mutated City")
$a(MyInterface.metadata, "meta.description", "Mutated Interface")

// prettier-ignore-end