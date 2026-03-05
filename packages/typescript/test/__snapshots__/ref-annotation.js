// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class PostTag {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "PostTag"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class User {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "User"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", PostTag)
  .prop(
    "postId",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "tagId",
    $().designType("number")
      .tags("number")
      .$type
  )

$("object", User)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("some.ref", () => PostTag)
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("string")
      .annotate("some.ref", { type: () => User, field: "name" })
      .$type
  )

// prettier-ignore-end