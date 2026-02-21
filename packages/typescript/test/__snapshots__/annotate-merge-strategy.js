// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class User {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class User2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", User)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Original Name")
      .annotate("mulAppend", "prop-original", true)
      .annotate("mul", 1, true)
      .annotate("mul", 2, true)
      .$type
  )
  .annotate("mulAppend", "top-original", true)

// Ad-hoc annotations for User
$a(User.type.props.get("name")?.metadata, "label", "Mutated Name")
$a(User.type.props.get("name")?.metadata, "mulAppend", "prop-mutated", true)
User.type.props.get("name")?.metadata.delete("mul")
$a(User.type.props.get("name")?.metadata, "mul", 99, true)
$a(User.metadata, "mulAppend", "top-mutated", true)

$("object", User2)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Aliased Name")
      .annotate("mulAppend", "prop-aliased", true)
      .annotate("mul", 77, true)
      .annotate("mulAppend", "prop-original", true)
      .$type
  )
  .annotate("mulAppend", "top-aliased", true)
  .annotate("mulAppend", "top-original", true)

// prettier-ignore-end