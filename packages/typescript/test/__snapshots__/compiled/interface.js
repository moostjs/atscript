// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, throwFeatureDisabled as $d, registerCompiledCheck as $cv } from "@atscript/typescript/utils"

export class PublicInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "PublicInterface"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", PublicInterface)
  .prop(
    "primitive",
    $().designType("string")
      .tags("string")
      .$type
  ).prop(
    "pirmiitiveUn",
    $("union")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($().designType("number")
          .tags("number")
          .$type)
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("email", "string")
      .annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true)
      .$type
  ).prop(
    "interger",
    $().designType("number")
      .tags("int", "number")
      .annotate("expect.int", true)
      .$type
  ).prop(
    "literal",
    $()
      .designType("string")
      .value("value")
      .$type
  ).prop(
    "number",
    $()
      .designType("number")
      .value(5)
      .$type
  ).prop(
    "tuple1",
    $("tuple")
      .item($().designType("string")
          .tags("string")
          .$type)
      .$type
  ).prop(
    "tuple2",
    $("tuple")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($().designType("string")
          .tags("string")
          .$type)
      .$type
  ).prop(
    "tupleArray",
    $("array")
      .of($("tuple")
          .item($().designType("string")
              .tags("string")
              .$type)
          .item($().designType("string")
              .tags("string")
              .$type)
          .$type)
      .$type
  ).prop(
    "array",
    $("array")
      .of($().designType("string")
          .tags("string")
          .$type)
      .$type
  ).prop(
    "array2",
    $("array")
      .of($("array")
          .of($().designType("string")
              .tags("string")
              .$type)
          .$type)
      .$type
  ).prop(
    "array3",
    $("array")
      .of($("array")
          .of($("array")
              .of($().designType("string")
                  .tags("string")
                  .$type)
              .$type)
          .$type)
      .$type
  ).prop(
    "complexArray",
    $("array")
      .of($("union")
          .item($().designType("string")
              .tags("string")
              .$type)
          .item($().designType("number")
              .tags("number")
              .$type)
          .$type)
      .$type
  ).prop(
    "complexArray2",
    $("array")
      .of($("array")
          .of($("union")
              .item($().designType("string")
                  .tags("string")
                  .$type)
              .item($().designType("number")
                  .tags("number")
                  .$type)
              .$type)
          .$type)
      .$type
  ).prop(
    "complexArray3",
    $("array")
      .of($("array")
          .of($("array")
              .of($("union")
                  .item($().designType("string")
                      .tags("string")
                      .$type)
                  .item($().designType("number")
                      .tags("number")
                      .$type)
                  .$type)
              .$type)
          .$type)
      .$type
  ).prop(
    "complexArray4",
    $("union")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($("array")
          .of($().designType("number")
              .tags("number")
              .$type)
          .$type)
      .$type
  ).prop(
    "complexArray5",
    $("union")
      .item($("array")
          .of($().designType("string")
              .tags("string")
              .$type)
          .$type)
      .item($().designType("number")
          .tags("number")
          .$type)
      .$type
  ).prop(
    "object",
    $("object")
      .prop(
        "prop1",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "prop2",
        $().designType("number")
          .tags("number")
          .optional()
          .$type
      ).prop(
        "nested",
        $("object")
          .prop(
            "prop3",
            $().designType("boolean")
              .tags("boolean")
              .$type
          ).prop(
            "prop4",
            $().designType("boolean")
              .tags("boolean")
              .optional()
              .$type
          )
          .$type
      )
      .$type
  ).prop(
    "optional",
    $().designType("string")
      .tags("string")
      .optional()
      .$type
  ).prop(
    "objectUnion1",
    $("union")
      .item($("object")
          .prop(
            "a",
            $()
              .designType("string")
              .value("a")
              .$type
          )
          .$type)
      .item($().designType("string")
          .tags("string")
          .$type)
      .$type
  ).prop(
    "objectUnion2",
    $("union")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($("object")
          .prop(
            "a",
            $()
              .designType("string")
              .value("a")
              .$type
          )
          .$type)
      .$type
  ).prop(
    "objectIntersection",
    $("object")
      .prop(
        "a",
        $()
          .designType("string")
          .value("a")
          .$type
      ).prop(
        "b",
        $()
          .designType("string")
          .value("b")
          .$type
      )
      .$type
  ).prop(
    "grouping",
    $("union")
      .item($().designType("string")
          .tags("string")
          .$type)
      .item($("union")
          .item($().designType("never")
              .tags("never")
              .$type)
          .item($()
              .designType("string")
              .value("c")
              .$type)
          .$type)
      .$type
  )

// Compiled validator checks
$cv(PublicInterface, 2, [[[1,["primitive","pirmiitiveUn","email","interger","literal","number","tuple1","tuple2","tupleArray","array","array2","array3","complexArray","complexArray2","complexArray3","complexArray4","complexArray5","object","optional","objectUnion1","objectUnion2","objectIntersection","grouping"],[[0,0,1,"",0],[0,0,2,"",0],[0,8,5,"n",0],[0,16,6,"",1],[0,0,7,"",1],[0,0,8,"",1],[0,0,9,"",1],[0,0,11,"",1],[0,0,14,"",1],[0,0,18,"",1],[0,0,20,"",1],[0,0,23,"",1],[0,0,27,"",1],[0,0,31,"",1],[0,0,36,"",1],[0,0,42,"",1],[0,0,46,"",1],[0,0,50,"",1],[1,0,56,"",1],[0,0,57,"",1],[0,0,61,"",1],[0,0,65,"",1],[0,0,68,"",1]]],[0,"string"],[3,[[0,0,3,"",0],[0,0,4,"",0]]],[0,"string"],[0,"number"],[0,"string"],[0,"number"],[0,"string","value"],[0,"number",5],[5,[[0,0,10,"",1]]],[0,"string"],[5,[[0,0,12,"",1],[0,0,13,"",1]]],[0,"string"],[0,"string"],[2,[0,0,15,"",1]],[5,[[0,0,16,"",1],[0,0,17,"",1]]],[0,"string"],[0,"string"],[2,[0,0,19,"",1]],[0,"string"],[2,[0,0,21,"",1]],[2,[0,0,22,"",1]],[0,"string"],[2,[0,0,24,"",1]],[2,[0,0,25,"",1]],[2,[0,0,26,"",1]],[0,"string"],[2,[0,0,28,"",1]],[3,[[0,0,29,"",1],[0,0,30,"",1]]],[0,"string"],[0,"number"],[2,[0,0,32,"",1]],[2,[0,0,33,"",1]],[3,[[0,0,34,"",1],[0,0,35,"",1]]],[0,"string"],[0,"number"],[2,[0,0,37,"",1]],[2,[0,0,38,"",1]],[2,[0,0,39,"",1]],[3,[[0,0,40,"",1],[0,0,41,"",1]]],[0,"string"],[0,"number"],[3,[[0,0,43,"",1],[0,0,44,"",1]]],[0,"string"],[2,[0,0,45,"",1]],[0,"number"],[3,[[0,0,47,"",1],[0,0,49,"",1]]],[2,[0,0,48,"",1]],[0,"string"],[0,"number"],[1,["prop1","prop2","nested"],[[0,0,51,"",1],[1,0,52,"",1],[0,0,53,"",1]]],[0,"string"],[0,"number"],[1,["prop3","prop4"],[[0,0,54,"",1],[1,0,55,"",1]]],[0,"boolean"],[0,"boolean"],[0,"string"],[3,[[0,0,58,"",1],[0,0,60,"",1]]],[1,["a"],[[0,0,59,"",1]]],[0,"string","a"],[0,"string"],[3,[[0,0,62,"",1],[0,0,63,"",1]]],[0,"string"],[1,["a"],[[0,0,64,"",1]]],[0,"string","a"],[1,["a","b"],[[0,0,66,"",1],[0,0,67,"",1]]],[0,"string","a"],[0,"string","b"],[3,[[0,0,69,"",1],[0,0,70,"",1]]],[0,"string"],[3,[[0,0,71,"",1],[0,0,72,"",1]]],[0,"never"],[0,"string","c"]],[0,0,0,"",1],1], (K, H) => {
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
      const x1 = v.primitive
      if (x1 === undefined && sk) break P0
      if (typeof x1 !== "string") { if (q) return 0; r = 0; break P0 }
    }
    P2: {
      const x3 = v.pirmiitiveUn
      if (x3 === undefined && sk) break P2
      U4: {
        B5: {
          if (typeof x3 !== "string") break B5
          break U4
        }
        B6: {
          if (typeof x3 !== "number" || !Number.isFinite(x3)) break B6
          break U4
        }
        { if (q) return 0; r = 0; break P2 }
      }
    }
    P7: {
      const x8 = v.email
      if (x8 === undefined && sk) break P7
      if (typeof x8 !== "string") { if (q) return 0; r = 0; break P7 }
      if (!k0.test(x8)) { if (q) return 0; r = 0; break P7 }
    }
    P9: {
      const x10 = v.interger
      if (x10 === undefined && sk) break P9
      if (typeof x10 !== "number" || !Number.isFinite(x10) || x10 % 1 !== 0) { if (q) return 0; r = 0; break P9 }
    }
    P11: {
      const x12 = v.literal
      if (x12 === undefined && sk) break P11
      if (x12 !== "value") { if (q) return 0; r = 0; break P11 }
    }
    P13: {
      const x14 = v.number
      if (x14 === undefined && sk) break P13
      if (x14 !== 5) { if (q) return 0; r = 0; break P13 }
    }
    P15: {
      const x16 = v.tuple1
      if (x16 === undefined && sk) break P15
      if (!Array.isArray(x16) || x16.length !== 1) { if (q) return 0; r = 0; break P15 }
      const e17 = x16[0]
      if (typeof e17 !== "string") { if (q) return 0; r = 0; break P15 }
    }
    P18: {
      const x19 = v.tuple2
      if (x19 === undefined && sk) break P18
      if (!Array.isArray(x19) || x19.length !== 2) { if (q) return 0; r = 0; break P18 }
      const e20 = x19[0]
      if (typeof e20 !== "string") { if (q) return 0; r = 0; break P18 }
      const e21 = x19[1]
      if (typeof e21 !== "string") { if (q) return 0; r = 0; break P18 }
    }
    P22: {
      const x23 = v.tupleArray
      if (x23 === undefined && sk) break P22
      if (!Array.isArray(x23)) { if (q) return 0; r = 0; break P22 }
      let a25 = 1
      for (const y24 of x23) {
        if (!Array.isArray(y24) || y24.length !== 2) { if (q) return 0; a25 = 0; continue }
        const e26 = y24[0]
        if (typeof e26 !== "string") { if (q) return 0; a25 = 0; continue }
        const e27 = y24[1]
        if (typeof e27 !== "string") { if (q) return 0; a25 = 0; continue }
      }
      if (a25 === 0) { r = 0; break P22 }
    }
    P28: {
      const x29 = v.array
      if (x29 === undefined && sk) break P28
      if (!Array.isArray(x29)) { if (q) return 0; r = 0; break P28 }
      let a31 = 1
      for (const y30 of x29) {
        if (typeof y30 !== "string") { if (q) return 0; a31 = 0; continue }
      }
      if (a31 === 0) { r = 0; break P28 }
    }
    P32: {
      const x33 = v.array2
      if (x33 === undefined && sk) break P32
      if (!Array.isArray(x33)) { if (q) return 0; r = 0; break P32 }
      let a35 = 1
      for (const y34 of x33) {
        if (!Array.isArray(y34)) { if (q) return 0; a35 = 0; continue }
        let a37 = 1
        for (const y36 of y34) {
          if (typeof y36 !== "string") { if (q) return 0; a37 = 0; continue }
        }
        if (a37 === 0) { a35 = 0; continue }
      }
      if (a35 === 0) { r = 0; break P32 }
    }
    P38: {
      const x39 = v.array3
      if (x39 === undefined && sk) break P38
      if (!Array.isArray(x39)) { if (q) return 0; r = 0; break P38 }
      let a41 = 1
      for (const y40 of x39) {
        if (!Array.isArray(y40)) { if (q) return 0; a41 = 0; continue }
        let a43 = 1
        for (const y42 of y40) {
          if (!Array.isArray(y42)) { if (q) return 0; a43 = 0; continue }
          let a45 = 1
          for (const y44 of y42) {
            if (typeof y44 !== "string") { if (q) return 0; a45 = 0; continue }
          }
          if (a45 === 0) { a43 = 0; continue }
        }
        if (a43 === 0) { a41 = 0; continue }
      }
      if (a41 === 0) { r = 0; break P38 }
    }
    P46: {
      const x47 = v.complexArray
      if (x47 === undefined && sk) break P46
      if (!Array.isArray(x47)) { if (q) return 0; r = 0; break P46 }
      let a49 = 1
      for (const y48 of x47) {
        U50: {
          B51: {
            if (typeof y48 !== "string") break B51
            break U50
          }
          B52: {
            if (typeof y48 !== "number" || !Number.isFinite(y48)) break B52
            break U50
          }
          { if (q) return 0; a49 = 0; continue }
        }
      }
      if (a49 === 0) { r = 0; break P46 }
    }
    P53: {
      const x54 = v.complexArray2
      if (x54 === undefined && sk) break P53
      if (!Array.isArray(x54)) { if (q) return 0; r = 0; break P53 }
      let a56 = 1
      for (const y55 of x54) {
        if (!Array.isArray(y55)) { if (q) return 0; a56 = 0; continue }
        let a58 = 1
        for (const y57 of y55) {
          U59: {
            B60: {
              if (typeof y57 !== "string") break B60
              break U59
            }
            B61: {
              if (typeof y57 !== "number" || !Number.isFinite(y57)) break B61
              break U59
            }
            { if (q) return 0; a58 = 0; continue }
          }
        }
        if (a58 === 0) { a56 = 0; continue }
      }
      if (a56 === 0) { r = 0; break P53 }
    }
    P62: {
      const x63 = v.complexArray3
      if (x63 === undefined && sk) break P62
      if (!Array.isArray(x63)) { if (q) return 0; r = 0; break P62 }
      let a65 = 1
      for (const y64 of x63) {
        if (!Array.isArray(y64)) { if (q) return 0; a65 = 0; continue }
        let a67 = 1
        for (const y66 of y64) {
          if (!Array.isArray(y66)) { if (q) return 0; a67 = 0; continue }
          let a69 = 1
          for (const y68 of y66) {
            U70: {
              B71: {
                if (typeof y68 !== "string") break B71
                break U70
              }
              B72: {
                if (typeof y68 !== "number" || !Number.isFinite(y68)) break B72
                break U70
              }
              { if (q) return 0; a69 = 0; continue }
            }
          }
          if (a69 === 0) { a67 = 0; continue }
        }
        if (a67 === 0) { a65 = 0; continue }
      }
      if (a65 === 0) { r = 0; break P62 }
    }
    P73: {
      const x74 = v.complexArray4
      if (x74 === undefined && sk) break P73
      U75: {
        B76: {
          if (typeof x74 !== "string") break B76
          break U75
        }
        B77: {
          if (!Array.isArray(x74)) break B77
          let a79 = 1
          for (const y78 of x74) {
            if (typeof y78 !== "number" || !Number.isFinite(y78)) { a79 = 0; continue }
          }
          if (a79 === 0) break B77
          break U75
        }
        { if (q) return 0; r = 0; break P73 }
      }
    }
    P80: {
      const x81 = v.complexArray5
      if (x81 === undefined && sk) break P80
      U82: {
        B83: {
          if (!Array.isArray(x81)) break B83
          let a85 = 1
          for (const y84 of x81) {
            if (typeof y84 !== "string") { a85 = 0; continue }
          }
          if (a85 === 0) break B83
          break U82
        }
        B86: {
          if (typeof x81 !== "number" || !Number.isFinite(x81)) break B86
          break U82
        }
        { if (q) return 0; r = 0; break P80 }
      }
    }
    P87: {
      const x88 = v.object
      if (x88 === undefined && sk) break P87
      t = d50(x88, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P87 }
    }
    P89: {
      const x90 = v.optional
      if (x90 !== undefined && x90 !== null) {
        if (typeof x90 !== "string") { if (q) return 0; r = 0; break P89 }
      }
    }
    P91: {
      const x92 = v.objectUnion1
      if (x92 === undefined && sk) break P91
      U93: {
        B94: {
          t = d58(x92, (f & -2) | 2, o)
          if (t !== 1) { if (t === 2) return 2; break B94 }
          break U93
        }
        if (pk.length !== 0) return 2
        B95: {
          if (typeof x92 !== "string") break B95
          break U93
        }
        { if (q) return 0; r = 0; break P91 }
      }
    }
    P96: {
      const x97 = v.objectUnion2
      if (x97 === undefined && sk) break P96
      U98: {
        B99: {
          if (typeof x97 !== "string") break B99
          break U98
        }
        B100: {
          t = d63(x97, (f & -2) | 2, o)
          if (t !== 1) { if (t === 2) return 2; break B100 }
          break U98
        }
        if (pk.length !== 0) return 2
        { if (q) return 0; r = 0; break P96 }
      }
    }
    P101: {
      const x102 = v.objectIntersection
      if (x102 === undefined && sk) break P101
      t = d65(x102, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P101 }
    }
    P103: {
      const x104 = v.grouping
      if (x104 === undefined && sk) break P103
      U105: {
        B106: {
          if (typeof x104 !== "string") break B106
          break U105
        }
        B107: {
          U108: {
            B109: {
              if (x104 !== "c") break B109
              break U108
            }
            break B107
          }
          break U105
        }
        { if (q) return 0; r = 0; break P103 }
      }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "primitive":
          case "pirmiitiveUn":
          case "email":
          case "interger":
          case "literal":
          case "number":
          case "tuple1":
          case "tuple2":
          case "tupleArray":
          case "array":
          case "array2":
          case "array3":
          case "complexArray":
          case "complexArray2":
          case "complexArray3":
          case "complexArray4":
          case "complexArray5":
          case "object":
          case "optional":
          case "objectUnion1":
          case "objectUnion2":
          case "objectIntersection":
          case "grouping":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d50(v, f, o) {
    const q = (f & 2) === 0
    let t
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P110: {
      const x111 = v.prop1
      if (x111 === undefined && sk) break P110
      if (typeof x111 !== "string") { if (q) return 0; r = 0; break P110 }
    }
    P112: {
      const x113 = v.prop2
      if (x113 !== undefined && x113 !== null) {
        if (typeof x113 !== "number" || !Number.isFinite(x113)) { if (q) return 0; r = 0; break P112 }
      }
    }
    P114: {
      const x115 = v.nested
      if (x115 === undefined && sk) break P114
      t = d53(x115, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P114 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "prop1":
          case "prop2":
          case "nested":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d53(v, f, o) {
    const q = (f & 2) === 0
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P116: {
      const x117 = v.prop3
      if (x117 === undefined && sk) break P116
      if (typeof x117 !== "boolean") { if (q) return 0; r = 0; break P116 }
    }
    P118: {
      const x119 = v.prop4
      if (x119 !== undefined && x119 !== null) {
        if (typeof x119 !== "boolean") { if (q) return 0; r = 0; break P118 }
      }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "prop3":
          case "prop4":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d58(v, f, o) {
    const q = (f & 2) === 0
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P120: {
      const x121 = v.a
      if (x121 === undefined && sk) break P120
      if (x121 !== "a") { if (q) return 0; r = 0; break P120 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "a":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d63(v, f, o) {
    const q = (f & 2) === 0
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P122: {
      const x123 = v.a
      if (x123 === undefined && sk) break P122
      if (x123 !== "a") { if (q) return 0; r = 0; break P122 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "a":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d65(v, f, o) {
    const q = (f & 2) === 0
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P124: {
      const x125 = v.a
      if (x125 === undefined && sk) break P124
      if (x125 !== "a") { if (q) return 0; r = 0; break P124 }
    }
    P126: {
      const x127 = v.b
      if (x127 === undefined && sk) break P126
      if (x127 !== "b") { if (q) return 0; r = 0; break P126 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "a":
          case "b":
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