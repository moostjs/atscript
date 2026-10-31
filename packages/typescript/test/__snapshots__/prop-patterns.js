// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, $f as $f, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"

export class WithPatterns {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "WithPatterns"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class WithPatterns2 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "WithPatterns2"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
let $i_WithPatterns_nested_0
class $M0 { static __is_atscript_annotated_type = true; static type = {}; static metadata = new Map() }

$i_WithPatterns_nested_0 = $("object")
  .propPattern(/./, $().designType("number")
    .tags("number").$type)
  .propPattern(/^str/i, $().designType("string")
    .tags("string").$type).$type

$("object", WithPatterns2)
  .propPattern(/./, $().designType("boolean")
    .tags("boolean").$type)

$("object", $M0).over([WithPatterns2], true)
  .propPattern(/./, $().designType("never").tags("never").over([$f($i_WithPatterns_nested_0, "*"), $f(WithPatterns2, "*")]).$type)
  .propPattern(/^str/i, $f($i_WithPatterns_nested_0, "/^str/i"))

$("object", WithPatterns)
  .prop("prop1", $().designType("string")
    .tags("string").$type)
  .propPattern(/./, $().designType("number")
    .tags("number").$type)
  .propPattern(/^abc/i, $().designType("boolean")
    .tags("boolean").$type)
  .prop("nested", $().type($M0).over([WithPatterns2], true).$type)

export { $i_WithPatterns_nested_0 }
export { $M0 as $h_WithPatterns_nested }
// prettier-ignore-end