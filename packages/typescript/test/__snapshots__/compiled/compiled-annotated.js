// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, throwFeatureDisabled as $d, registerCompiledCheck as $cv, $f as $f, $ak as $ak, $nr as $nk } from "@atscript/typescript/utils"
import { Address } from "./ext.as"

export class Line {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Line"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


class Status {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Status"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Order {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Order"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}


export class Plain {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "Plain"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$ak("expect.pattern", "mulAppend")
$nk("meta.default", "meta.id", "meta.readonly", "meta.required")
$("object", Line)
  .prop("qty", $().designType("number")
    .tags("number").annotate("expect.min", { minValue: 1,  }).$type)
  .prop("sku", $().designType("string")
    .tags("string").annotate("expect.pattern", { pattern: "^[A-Z]+$",  }, true).$type)

$("union", Status)
  .item($()
    .designType("string")
    .value("open").$type)
  .item($()
    .designType("string")
    .value("closed").$type).annotate("emit.compiledValidator", true)

$("object", Order).annotate("emit.compiledValidator", true)
  .prop("lines", $("array").of($().ref(Line).$type).annotate("expect.minLength", { length: 1,  }).$type)
  .prop("status", $().ref(Status).$type)
  .prop("address", $().ref(Address).$type)
  .prop("billing", $().ref(Address).optional().$type)

$("object", Plain)
  .prop("name", $().designType("string")
    .tags("string").$type)

// Compiled validator checks
$cv(Status, 4, [[[3,[[0,0,1,"",0],[0,0,2,"",0]]],[0,"string","open"],[0,"string","closed"]],[0,0,0,"",0],0], (K, H) => {
  function r(v, f, o) {
    U0: {
      B1: {
        if (v !== "open") break B1
        break U0
      }
      B2: {
        if (v !== "closed") break B2
        break U0
      }
      return 0
    }
    return 1
  }
  return r
})
$cv(Order, 4, [[[1,["lines","status","address","billing"],[[0,2,1,"",2],[0,0,5,"",3],[0,0,-1,"",3],[1,0,-1,"",5]]],[2,[0,0,2,"",2]],[1,["qty","sku"],[[0,32,3,"",0],[0,8,4,"n",1]]],[0,"number"],[0,"string"],[3,[[0,0,6,"",3],[0,0,7,"",3]]],[0,"string","open"],[0,"string","closed"]],[0,0,0,"",7],7], (K, H) => {
  const pk = H.pk, ho = H.ho
  const k0 = K[0], k1 = K[1], k2 = K[2], k3 = K[3], k5 = K[5]
  function d0(v, f, o) {
    const q = (f & 2) === 0
    let t
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P0: {
      const x1 = v.lines
      if (x1 === undefined && sk) break P0
      if (!Array.isArray(x1)) { if (q) return 0; r = 0; break P0 }
      if (x1.length < k2) { if (q) return 0; r = 0; break P0 }
      let a3 = 1
      for (const y2 of x1) {
        t = d2(y2, f & -2, o)
        if (t !== 1) { if (t === 2) return 2; if (q) return 0; a3 = 0; continue }
      }
      if (a3 === 0) { r = 0; break P0 }
    }
    P4: {
      const x5 = v.status
      if (x5 === undefined && sk) break P4
      U6: {
        B7: {
          if (x5 !== "open") break B7
          break U6
        }
        B8: {
          if (x5 !== "closed") break B8
          break U6
        }
        { if (q) return 0; r = 0; break P4 }
      }
    }
    P9: {
      const x10 = v.address
      if (x10 === undefined && sk) break P9
      t = k3(x10, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P9 }
    }
    P11: {
      const x12 = v.billing
      if (x12 !== undefined && x12 !== null) {
        t = k5(x12, f & -2, o)
        if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P11 }
      }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "lines":
          case "status":
          case "address":
          case "billing":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d2(v, f, o) {
    const q = (f & 2) === 0
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P13: {
      const x14 = v.qty
      if (x14 === undefined && sk) break P13
      if (typeof x14 !== "number" || !Number.isFinite(x14) || x14 < k0) { if (q) return 0; r = 0; break P13 }
    }
    P15: {
      const x16 = v.sku
      if (x16 === undefined && sk) break P15
      if (typeof x16 !== "string") { if (q) return 0; r = 0; break P15 }
      if (!k1.test(x16)) { if (q) return 0; r = 0; break P15 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "qty":
          case "sku":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  return d0
})

// prettier-ignore-end