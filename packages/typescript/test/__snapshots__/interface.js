// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

export class PublicInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "PublicInterface"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
let $i_PublicInterface_objectIntersection_0, $i_PublicInterface_objectIntersection_1, $i_PublicInterface_grouping__1__0_2
class $M0 { static __is_atscript_annotated_type = true; static type = {}; static metadata = new Map() }

$i_PublicInterface_objectIntersection_0 = $("object")
  .prop("a", $()
    .designType("string")
    .value("a").$type).$type

$i_PublicInterface_objectIntersection_1 = $("object")
  .prop("b", $()
    .designType("string")
    .value("b").$type).$type

$("object", $M0)
  .prop("a", $f($i_PublicInterface_objectIntersection_0, "a"))
  .prop("b", $f($i_PublicInterface_objectIntersection_1, "b"))

$i_PublicInterface_grouping__1__0_2 = $("object")
  .prop("a", $()
    .designType("string")
    .value("b").$type).$type

$("object", PublicInterface)
  .prop("primitive", $().designType("string")
    .tags("string").$type)
  .prop("pirmiitiveUn", $("union")
    .item($().designType("string")
      .tags("string").$type)
    .item($().designType("number")
      .tags("number").$type).$type)
  .prop("email", $().designType("string")
    .tags("email", "string").annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true).$type)
  .prop("interger", $().designType("number")
    .tags("int", "number").annotate("expect.int", true).$type)
  .prop("literal", $()
    .designType("string")
    .value("value").$type)
  .prop("number", $()
    .designType("number")
    .value(5).$type)
  .prop("tuple1", $("tuple")
    .item($().designType("string")
      .tags("string").$type).$type)
  .prop("tuple2", $("tuple")
    .item($().designType("string")
      .tags("string").$type)
    .item($().designType("string")
      .tags("string").$type).$type)
  .prop("tupleArray", $("array").of($("tuple")
      .item($().designType("string")
        .tags("string").$type)
      .item($().designType("string")
        .tags("string").$type).$type).$type)
  .prop("array", $("array").of($().designType("string")
      .tags("string").$type).$type)
  .prop("array2", $("array").of($("array").of($().designType("string")
        .tags("string").$type).$type).$type)
  .prop("array3", $("array").of($("array").of($("array").of($().designType("string")
          .tags("string").$type).$type).$type).$type)
  .prop("complexArray", $("array").of($("union")
      .item($().designType("string")
        .tags("string").$type)
      .item($().designType("number")
        .tags("number").$type).$type).$type)
  .prop("complexArray2", $("array").of($("array").of($("union")
        .item($().designType("string")
          .tags("string").$type)
        .item($().designType("number")
          .tags("number").$type).$type).$type).$type)
  .prop("complexArray3", $("array").of($("array").of($("array").of($("union")
          .item($().designType("string")
            .tags("string").$type)
          .item($().designType("number")
            .tags("number").$type).$type).$type).$type).$type)
  .prop("complexArray4", $("union")
    .item($().designType("string")
      .tags("string").$type)
    .item($("array").of($().designType("number")
        .tags("number").$type).$type).$type)
  .prop("complexArray5", $("union")
    .item($("array").of($().designType("string")
        .tags("string").$type).$type)
    .item($().designType("number")
      .tags("number").$type).$type)
  .prop("object", $("object")
    .prop("prop1", $().designType("string")
      .tags("string").$type)
    .prop("prop2", $().designType("number")
      .tags("number").optional().$type)
    .prop("nested", $("object")
      .prop("prop3", $().designType("boolean")
        .tags("boolean").$type)
      .prop("prop4", $().designType("boolean")
        .tags("boolean").optional().$type).$type).$type)
  .prop("optional", $().designType("string")
    .tags("string").optional().$type)
  .prop("objectUnion1", $("union")
    .item($("object")
      .prop("a", $()
        .designType("string")
        .value("a").$type).$type)
    .item($().designType("string")
      .tags("string").$type).$type)
  .prop("objectUnion2", $("union")
    .item($().designType("string")
      .tags("string").$type)
    .item($("object")
      .prop("a", $()
        .designType("string")
        .value("a").$type).$type).$type)
  .prop("objectIntersection", $().type($M0).$type)
  .prop("grouping", $("union")
    .item($().designType("string")
      .tags("string").$type)
    .item($("union")
      .item($().designType("never").tags("never").$type)
      .item($()
        .designType("string")
        .value("c").$type).$type).$type)

export { $i_PublicInterface_objectIntersection_0 }
export { $i_PublicInterface_objectIntersection_1 }
export { $M0 as $h_PublicInterface_objectIntersection }
export { $i_PublicInterface_grouping__1__0_2 }
// prettier-ignore-end