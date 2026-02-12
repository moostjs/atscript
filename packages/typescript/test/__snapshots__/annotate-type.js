// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a, buildJsonSchema as $$ } from "@atscript/typescript/utils"

export class TString {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TString2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


class TO {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}


export class TO2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    return this._jsonSchema ?? (this._jsonSchema = $$(this))
  }
}

$("union", TString)
  .item($().designType("string")
      .tags("string")
      .$type)
  .item($().designType("number")
      .tags("number")
      .$type)

$("union", TString2)
  .item($().designType("string")
      .tags("string")
      .$type)
  .item($().designType("number")
      .tags("number")
      .$type)
  .annotate("meta.label", "Labeled String 2")

$("union", TO)
  .item($("object")
      .prop(
        "name",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "age",
        $().designType("number")
          .tags("number")
          .$type
      )
      .$type)
  .item($("object")
      .prop(
        "kind",
        $("union")
          .item($()
              .designType("string")
              .value("abc")
              .$type)
          .item($()
              .designType("string")
              .value("def")
              .$type)
          .$type
      )
      .$type)

$("union", TO2)
  .item($("object")
      .prop(
        "name",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "age",
        $().designType("number")
          .tags("number")
          .annotate("meta.label", "Age")
          .$type
      )
      .$type)
  .item($("object")
      .prop(
        "kind",
        $("union")
          .item($()
              .designType("string")
              .value("abc")
              .$type)
          .item($()
              .designType("string")
              .value("def")
              .$type)
          .annotate("meta.label", "Kind")
          .$type
      )
      .$type)

$a(TString.metadata, "meta.label", "Labeled String")
$a(TO.type.items[0].type.props.get("age")?.metadata, "meta.description", "Mutated Descr Age")
$a(TO.type.items[1].type.props.get("kind")?.metadata, "meta.description", "Mutated Descr Kind")
$a(TO.metadata, "meta.description", "Mutated Descr")
// prettier-ignore-end