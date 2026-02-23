// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, cloneRefProp as $c, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

class Contact {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Contact"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class Address {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Address"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Deep {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Deep"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class AliasedDeep {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "AliasedDeep"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Contact)
  .prop(
    "phone",
    $().designType("string")
      .tags("string")
      .annotate("label", "Phone")
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("email", "string")
      .annotate("label", "Email")
      .annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true)
      .$type
  )

$("object", Address)
  .prop(
    "street",
    $().designType("string")
      .tags("string")
      .annotate("label", "Street")
      .$type
  ).prop(
    "contact",
    $()
      .refTo(Contact)
      .$type
  )

$("object", Deep)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Name")
      .$type
  ).prop(
    "address",
    $()
      .refTo(Address)
      .$type
  )

// Ad-hoc annotations for Deep
$c(Deep.type, "address")
$c(Deep.type.props.get("address")?.type, "contact")
$a(Deep.type.props.get("address")?.type.props.get("contact")?.type.props.get("phone")?.metadata, "label", "Mobile Phone")
$a(Deep.metadata, "meta.description", "Mutated Deep")

$("object", AliasedDeep)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Name")
      .$type
  ).prop(
    "address",
    $("object")
      .prop(
        "street",
        $().designType("string")
          .tags("string")
          .annotate("label", "Street")
          .$type
      ).prop(
        "contact",
        $("object")
          .prop(
            "phone",
            $().designType("string")
              .tags("string")
              .annotate("label", "Work Phone")
              .$type
          ).prop(
            "email",
            $().designType("string")
              .tags("email", "string")
              .annotate("label", "Email")
              .annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true)
              .$type
          )
          .$type
      )
      .$type
  )
  .annotate("meta.description", "Aliased Deep")

// prettier-ignore-end