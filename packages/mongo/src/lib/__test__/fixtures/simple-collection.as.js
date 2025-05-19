import { defineAnnotatedType as $ } from "@atscript/typescript"

export class SimpleCollection {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
}

$("object", SimpleCollection)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "active",
    $().designType("boolean")
      .tags("boolean")
      .$type
  ).prop(
    "occupation",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  ).prop(
    "tags",
    $("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .optional()
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "address",
    $("object")
      .prop(
        "line1",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "line2",
        $().designType("string")
          .tags("string")
          .optional()
          .$type
      ).prop(
        "city",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "state",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "zip",
        $().designType("string")
          .tags("string")
          .$type
      )
      .annotate("mongo.patch.strategy", "replace")
      .$type
  ).prop(
    "contacts",
    $("object")
      .prop(
        "email",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "phone",
        $().designType("string")
          .tags("string")
          .$type
      )
      .annotate("mongo.patch.strategy", "merge")
      .$type
  ).prop(
    "_id",
    $().designType("string")
      .tags("objectId", "mongo")
      .annotate("expect.pattern", { pattern: "^[a-fA-F0-9]{24}$",  flags: "",  }, true)
      .$type
  )
  .annotate("mongo.collection", "simple")
