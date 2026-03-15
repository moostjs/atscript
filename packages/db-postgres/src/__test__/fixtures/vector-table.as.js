// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class ArticlesTable {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "ArticlesTable"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", ArticlesTable)
  .prop(
    "id",
    $().designType("string")
      .tags("string")
      .annotate("meta.id", true)
      .$type
  ).prop(
    "title",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "embedding",
    $("array")
      .of($().designType("number")
          .tags("number")
          .$type)
      .annotate("db.search.vector", { dimensions: 1536,  similarity: "cosine",  })
      .$type
  )
  .annotate("db.table", "articles")

// prettier-ignore-end