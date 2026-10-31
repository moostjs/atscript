// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, registerCompiledCheck as $cv, $f as $f, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"
import { User } from "./multiple-interface.as"
import { TPrimitive, TNumber } from "./type.as"

export class People {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "People"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", People)
  .prop("groupName", $().ref(TPrimitive).$type)
  .prop("size", $().ref(TNumber).$type)
  .prop("users", $("array").of($().ref(User).$type).$type)

// Compiled validator checks
$cv(People, 5, [[[1,["groupName","size","users"],[[0,0,-1,"",0],[0,0,-1,"",2],[0,0,1,"",6]]],[2,[0,0,-1,"",4]]],[0,0,0,"",6],6], (K, H) => {
  const pk = H.pk, ho = H.ho
  const k0 = K[0], k2 = K[2], k4 = K[4]
  function d0(v, f, o) {
    const q = (f & 2) === 0
    let t
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P0: {
      const x1 = v.groupName
      if (x1 === undefined && sk) break P0
      t = k0(x1, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P0 }
    }
    P2: {
      const x3 = v.size
      if (x3 === undefined && sk) break P2
      t = k2(x3, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P2 }
    }
    P4: {
      const x5 = v.users
      if (x5 === undefined && sk) break P4
      if (!Array.isArray(x5)) { if (q) return 0; r = 0; break P4 }
      let a7 = 1
      for (const y6 of x5) {
        t = k4(y6, f & -2, o)
        if (t !== 1) { if (t === 2) return 2; if (q) return 0; a7 = 0; continue }
      }
      if (a7 === 0) { r = 0; break P4 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "groupName":
          case "size":
          case "users":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; pk.push(v, k) }
        }
      }
    }
    return 1
  }
  return d0
})

// prettier-ignore-end