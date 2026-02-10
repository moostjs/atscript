// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"

export class MyInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}

$("object", MyInterface)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Mutated Name")
      .annotate("mul", 42, true)
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .annotate("label", "Mutated Age")
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
          .annotate("label", "Mutated City")
          .$type
      )
      .$type
  )

MyInterface.type.props.get("name")?.metadata.set("label", "Mutated Name")
{
  const __t = MyInterface.type.props.get("name")?.metadata
  const __k = "mul"
  const __v = 42
  if (__t) { const __e = __t.get(__k); __t.set(__k, Array.isArray(__e) ? [...__e, __v] : __e !== undefined ? [__e, __v] : [__v]) }
}
MyInterface.type.props.get("age")?.metadata.set("label", "Mutated Age")
MyInterface.type.props.get("address")?.type.props.get("city")?.metadata.set("label", "Mutated City")
MyInterface.metadata.set("meta.description", "Mutated Interface")
// prettier-ignore-end