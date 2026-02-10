// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"

class TFirstName {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


class TLastName {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


class TAge {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class ITarget {
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}

$("", TFirstName).designType("string")
  .tags("string")
  .annotate("label", "First Name")

$("", TLastName).designType("string")
  .tags("string")
  .annotate("label", "Last Name")

$("", TAge).designType("number")
  .tags("number")
  .annotate("min", 18)

$("object", ITarget)
  .prop(
    "firstName",
    $().designType("string")
      .tags("string")
      .annotate("label", "First Name")
      .$type
  ).prop(
    "lastName",
    $().designType("string")
      .tags("string")
      .annotate("label", "Last Name (optional)")
      .annotate("required", false)
      .optional()
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .annotate("min", 18)
      .$type
  )

// prettier-ignore-end