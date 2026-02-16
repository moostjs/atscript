// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"

export class TString {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


export class TString2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


class TO {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}


export class TO2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static toJsonSchema() {
    throw new Error("JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.")
  }
}

$("union", TString)
  .item($().designType("string")
      .tags("string")
      .$type)
  .item($().designType("number")
      .tags("number")
      .$type)

// Ad-hoc annotations for TString
$a(TString.metadata, "meta.label", "Labeled String")

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

// Ad-hoc annotations for TO
$a(TO.type.items[0].type.props.get("age")?.metadata, "meta.description", "Mutated Descr Age")
$a(TO.type.items[1].type.props.get("kind")?.metadata, "meta.description", "Mutated Descr Kind")
$a(TO.metadata, "meta.description", "Mutated Descr")

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

// prettier-ignore-end