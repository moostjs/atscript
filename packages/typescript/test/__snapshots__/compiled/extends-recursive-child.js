// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d, registerCompiledCheck as $cv } from "@atscript/typescript/utils"
import { JsonValue } from "./extends-recursive-base.as"
import { Base } from "./extends-recursive-base.as"

export class Child {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Child"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", Child)
  .prop(
    "state",
    $("object")
      .prop(
        "context",
        $()
          .refTo(() => JsonValue)
          .$type
      ).prop(
        "meta",
        $("object")
          .propPattern(
            /^.+$/,
            $()
              .refTo(() => JsonValue)
              .$type
          )
          .optional()
          .$type
      )
      .$type
  ).prop(
    "id",
    $().designType("string")
      .tags("string")
      .$type
  )

// Compiled validator checks
$cv(Child, 2, [[[1,["state","id"],[[0,0,1,"",2],[0,0,3,"",2]]],[1,["context","meta"],[[0,0,-1,"",0],[1,0,2,"",2]]],[7],[0,"string"]],[0,0,0,"",2],2], (K, H) => {
  const pk = H.pk, ho = H.ho
  const k0 = K[0]
  function d0(v, f, o) {
    const q = (f & 2) === 0
    let t
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P0: {
      const x1 = v.state
      if (x1 === undefined && sk) break P0
      t = d1(x1, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P0 }
    }
    P2: {
      const x3 = v.id
      if (x3 === undefined && sk) break P2
      if (typeof x3 !== "string") { if (q) return 0; r = 0; break P2 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "state":
          case "id":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d1(v, f, o) {
    const q = (f & 2) === 0
    let t
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P4: {
      const x5 = v.context
      if (x5 === undefined && sk) break P4
      t = k0(x5, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P4 }
    }
    P6: {
      const x7 = v.meta
      if (x7 !== undefined && x7 !== null) {
        t = d2(x7, f & -2, o)
        if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P6 }
      }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "context":
          case "meta":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d2(v, f, o) {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    return 2
  }
  return d0
})

// prettier-ignore-end