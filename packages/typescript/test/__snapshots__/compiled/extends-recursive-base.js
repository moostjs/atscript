// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d, registerCompiledCheck as $cv } from "@atscript/typescript/utils"

export class JsonValue {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "JsonValue"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Base {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Base"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("union", JsonValue)
  .item($().designType("string")
      .tags("string")
      .$type)
  .item($().designType("number")
      .tags("number")
      .$type)
  .item($().designType("boolean")
      .tags("boolean")
      .$type)
  .item($().designType("null")
      .tags("null")
      .$type)
  .item($("array")
      .of($()
          .refTo(JsonValue)
          .$type)
      .$type)
  .item($("object")
      .propPattern(
        /^.+$/,
        $()
          .refTo(JsonValue)
          .$type
      )
      .$type)

$("object", Base)
  .prop(
    "state",
    $("object")
      .prop(
        "context",
        $()
          .refTo(JsonValue)
          .$type
      ).prop(
        "meta",
        $("object")
          .propPattern(
            /^.+$/,
            $()
              .refTo(JsonValue)
              .$type
          )
          .optional()
          .$type
      )
      .$type
  )

// Compiled validator checks
$cv(JsonValue, 2, [[[3,[[0,0,1,"",0],[0,0,2,"",0],[0,0,3,"",0],[0,0,4,"",0],[0,0,5,"",0],[0,0,6,"",0]]],[0,"string"],[0,"number"],[0,"boolean"],[0,"null"],[2,[0,0,0,"",0]],[7]],[0,0,0,"",0],0], (K, H) => {
  const pk = H.pk
  function d0(v, f, o) {
    let t
    B0: {
      if (typeof v !== "string") break B0
      return 1
    }
    B1: {
      if (typeof v !== "number" || !Number.isFinite(v)) break B1
      return 1
    }
    B2: {
      if (typeof v !== "boolean") break B2
      return 1
    }
    B3: {
      if (v !== null) break B3
      return 1
    }
    B4: {
      if (!Array.isArray(v)) break B4
      let a6 = 1
      for (const y5 of v) {
        t = d0(y5, (f & -2) | 2, o)
        if (t === 2) return 2
        if (t === 0) { a6 = 0; continue }
      }
      if (a6 === 0) break B4
      return 1
    }
    if (pk.length !== 0) return 2
    B7: {
      t = d6(v, f | 2, o)
      if (t !== 1) { if (t === 2) return 2; break B7 }
      return 1
    }
    if (pk.length !== 0) return 2
    return 0
  }
  function d6(v, f, o) {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    return 2
  }
  function r(v, f, o) {
    let t
    t = d0(v, f, o)
    if (t === 2) return 2
    if (t === 0) return 0
    return 1
  }
  return r
})
$cv(Base, 2, [[[1,["state"],[[0,0,1,"",0]]],[1,["context","meta"],[[0,0,2,"",0],[1,0,9,"",0]]],[3,[[0,0,3,"",0],[0,0,4,"",0],[0,0,5,"",0],[0,0,6,"",0],[0,0,7,"",0],[0,0,8,"",0]]],[0,"string"],[0,"number"],[0,"boolean"],[0,"null"],[2,[0,0,2,"",0]],[7],[7]],[0,0,0,"",0],0], (K, H) => {
  const pk = H.pk, ho = H.ho
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
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "state":
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
    P2: {
      const x3 = v.context
      if (x3 === undefined && sk) break P2
      t = d2(x3, f & -2, o)
      if (t === 2) return 2
      if (t === 0) { if (q) return 0; r = 0; break P2 }
    }
    P4: {
      const x5 = v.meta
      if (x5 !== undefined && x5 !== null) {
        t = d9(x5, f & -2, o)
        if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P4 }
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
    let t
    B6: {
      if (typeof v !== "string") break B6
      return 1
    }
    B7: {
      if (typeof v !== "number" || !Number.isFinite(v)) break B7
      return 1
    }
    B8: {
      if (typeof v !== "boolean") break B8
      return 1
    }
    B9: {
      if (v !== null) break B9
      return 1
    }
    B10: {
      if (!Array.isArray(v)) break B10
      let a12 = 1
      for (const y11 of v) {
        t = d2(y11, (f & -2) | 2, o)
        if (t === 2) return 2
        if (t === 0) { a12 = 0; continue }
      }
      if (a12 === 0) break B10
      return 1
    }
    if (pk.length !== 0) return 2
    B13: {
      t = d8(v, f | 2, o)
      if (t !== 1) { if (t === 2) return 2; break B13 }
      return 1
    }
    if (pk.length !== 0) return 2
    return 0
  }
  function d8(v, f, o) {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    return 2
  }
  function d9(v, f, o) {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    return 2
  }
  return d0
})

// prettier-ignore-end