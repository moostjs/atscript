// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d } from "@atscript/typescript/utils"

export class Article {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Article"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Article)
  .prop(
    "id",
    $().designType("number")
      .tags("number")
      .annotate("meta.id", true)
      .annotate("db.default.increment", true)
      .$type
  ).prop(
    "title",
    $().designType("string")
      .tags("string")
      .annotate("db.index.fulltext", { name: "articles_ft",  }, true)
      .$type
  ).prop(
    "body",
    $().designType("string")
      .tags("string")
      .annotate("db.index.fulltext", { name: "articles_ft",  }, true)
      .$type
  ).prop(
    "category",
    $().designType("string")
      .tags("string")
      .$type
  )
  .annotate("db.table", "articles")

// prettier-ignore-end