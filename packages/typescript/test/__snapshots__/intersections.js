// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $ } from "@atscript/typescript"

class IA {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class IB {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


class T {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}


export class I1 {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("object", IA)
  .prop(
    "a",
    $().designType("string")
      .tags("string")
      .annotate("label", "a from IA")
      .$type
  ).prop(
    "b",
    $().designType("number")
      .tags("number")
      .annotate("ia", true)
      .annotate("label", "b from IA")
      .optional()
      .$type
  )
  .annotate("label", "IA")

$("object", IB)
  .prop(
    "b",
    $().designType("number")
      .tags("number")
      .annotate("ib", true)
      .annotate("label", "b from IB")
      .$type
  ).prop(
    "c",
    $().designType("string")
      .tags("string")
      .annotate("label", "c from IB")
      .annotate("ib", true)
      .optional()
      .$type
  )
  .annotate("label", "IB")

$("object", T)
  .prop(
    "a",
    $().designType("string")
      .tags("string")
      .annotate("label", "a from IA")
      .$type
  ).prop(
    "b",
    $().designType("number")
      .tags("number")
      .annotate("ib", true)
      .annotate("label", "b from IB")
      .annotate("ia", true)
      .$type
  ).prop(
    "c",
    $().designType("string")
      .tags("string")
      .annotate("label", "c from IB")
      .annotate("ib", true)
      .optional()
      .$type
  )
  .annotate("Tlabel", "T")
  .annotate("label", "IB")

$("object", I1)
  .prop(
    "all",
    $()
      .refTo(T)
      .annotate("Tlabel", "T")
      .annotate("label", "IB")
      .$type
  ).prop(
    "a",
    $()
      .refTo(T, ["a"])
      .annotate("Tlabel", "T")
      .annotate("label", "IB")
      .$type
  ).prop(
    "b",
    $()
      .refTo(T, ["b"])
      .annotate("Tlabel", "T")
      .annotate("label", "IB")
      .$type
  ).prop(
    "c",
    $()
      .refTo(T, ["c"])
      .annotate("Tlabel", "T")
      .annotate("label", "IB")
      .$type
  )

// prettier-ignore-end