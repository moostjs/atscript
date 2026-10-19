// prettier-ignore-start
/* eslint-disable */
/* oxlint-disable */
import { defineAnnotatedType as $, annotate as $a, cloneRefProp as $c, throwFeatureDisabled as $d, registerCompiledCheck as $cv } from "@atscript/typescript/utils"

export class MyInterface {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = "MyInterface"
  static toJsonSchema() {
    $d("JSON Schema", "jsonSchema", "emit.jsonSchema")
  }
}

$("object", MyInterface)
  .prop(
    "name",
    $().designType("string")
      .tags("string")
      .annotate("label", "Original Name")
      .$type
  ).prop(
    "age",
    $().designType("number")
      .tags("number")
      .$type
  ).prop(
    "email",
    $().designType("string")
      .tags("email", "string")
      .annotate("expect.pattern", { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",  flags: "",  message: "Invalid email format." }, true)
      .$type
  ).prop(
    "address",
    $("object")
      .prop(
        "street",
        $().designType("string")
          .tags("string")
          .$type
      ).prop(
        "city",
        $().designType("string")
          .tags("string")
          .$type
      )
      .$type
  )

// Ad-hoc annotations for MyInterface
$a(MyInterface.type.props.get("name")?.metadata, "label", "Mutated Name")
MyInterface.type.props.get("name")?.metadata.delete("mul")
$a(MyInterface.type.props.get("name")?.metadata, "mul", 42, true)
$a(MyInterface.type.props.get("age")?.metadata, "label", "Mutated Age")
$a(MyInterface.type.props.get("address")?.type.props.get("city")?.metadata, "label", "Mutated City")
$a(MyInterface.metadata, "meta.description", "Mutated Interface")

// Compiled validator checks
$cv(MyInterface, 2, [[[1,["name","age","email","address"],[[0,0,1,"",0],[0,0,2,"",0],[0,8,3,"n",0],[0,0,4,"",1]]],[0,"string"],[0,"number"],[0,"string"],[1,["street","city"],[[0,0,5,"",1],[0,0,6,"",1]]],[0,"string"],[0,"string"]],[0,0,0,"",1],1], (K, H) => {
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
      const x1 = v.name
      if (x1 === undefined && sk) break P0
      if (typeof x1 !== "string") { if (q) return 0; r = 0; break P0 }
    }
    P2: {
      const x3 = v.age
      if (x3 === undefined && sk) break P2
      if (typeof x3 !== "number" || !Number.isFinite(x3)) { if (q) return 0; r = 0; break P2 }
    }
    P4: {
      const x5 = v.email
      if (x5 === undefined && sk) break P4
      if (typeof x5 !== "string") { if (q) return 0; r = 0; break P4 }
      if (!k0.test(x5)) { if (q) return 0; r = 0; break P4 }
    }
    P6: {
      const x7 = v.address
      if (x7 === undefined && sk) break P6
      t = d4(x7, f & -2, o)
      if (t !== 1) { if (t === 2) return 2; if (q) return 0; r = 0; break P6 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "name":
          case "age":
          case "email":
          case "address":
            break
          default:
            if (ho.call(v, k)) { if ((f & 4) !== 0) return 0; if ((f & 1) === 0) return 2; pk.push(k) }
        }
      }
    }
    return 1
  }
  function d4(v, f, o) {
    const q = (f & 2) === 0
    if (typeof v !== "object" || v === null || Array.isArray(v)) return 0
    if (pk.length !== 0) return 2
    const sk = (f & 16) !== 0 || (f & 33) === 33
    let r = 1
    P8: {
      const x9 = v.street
      if (x9 === undefined && sk) break P8
      if (typeof x9 !== "string") { if (q) return 0; r = 0; break P8 }
    }
    P10: {
      const x11 = v.city
      if (x11 === undefined && sk) break P10
      if (typeof x11 !== "string") { if (q) return 0; r = 0; break P10 }
    }
    if (r === 0) return 0
    if ((f & 12) !== 0) {
      for (const k in v) {
        switch (k) {
          case "street":
          case "city":
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