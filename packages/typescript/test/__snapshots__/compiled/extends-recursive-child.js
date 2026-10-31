// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, registerCompiledCheck as $cv, $f as $f, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"
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

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", Child)
  .prop("state", $f(Base, "state"))
  .prop("id", $().designType("string")
    .tags("string").$type)

// Compiled validator checks
$cv(Child, 5, [[[1,["state","id"],[[0,0,1,"",2],[0,0,3,"",2]]],[1,["context","meta"],[[0,0,-1,"",0],[1,0,2,"",2]]],[7],[0,"string"]],[0,0,0,"",2],2], (K, H) => {
  const pk = H.pk, ho = H.ho
  const k0 = K[0]
  function d0(v, f, o) {
    const q = (f & 2) === 0
    let t
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
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
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; pk.push(v, k) }
        }
      }
    }
    return 1
  }
  function d1(v, f, o) {
    const q = (f & 2) === 0
    let t
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
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
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; pk.push(v, k) }
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