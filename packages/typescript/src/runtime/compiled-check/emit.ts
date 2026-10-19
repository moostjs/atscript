/**
 * Emits the JS source of a compiled validator check factory from its layout.
 *
 * Build-time only (the renderer, and test code): the runtime never generates code. The
 * emitted factory `(K, H) => check` mirrors the interpreted pre-check
 * (validator-fast-check.ts) node for node — the same checks with the same PASS (1) /
 * FAIL (0) / BAIL (2) contract — specialised to the layout: one function per object type
 * def and per def that closes a reference cycle, everything else inlined.
 *
 * Generated code conventions:
 * - Every function is `(v, f, o)`: the value, the flags (TOP, IN_UNION and option bits —
 *   see `optionFlags`) and the validator options (passed on to interpreted sub-checks).
 * - A FAIL statement always leaves the current check: `return 0` outside unions; inside a
 *   union (where failures must visit everything the walk would) it records the failure and
 *   jumps past the failed node. `q` (`IN_UNION` unset) picks between the two when only the
 *   runtime flags tell. BAIL is always `return 2`.
 * - Annotation values are closure constants `k<slot>` read from `K` once per bind.
 */
import { validIdentifier } from '../../codegen/utils'
import { literalSource } from './build-layout'
import {
  ARRAY_BITS,
  B_INT,
  B_REQUIRED,
  B_UNIQUE,
  childSites,
  D_ARRAY,
  D_FINAL,
  D_INTERSECTION,
  D_OBJECT,
  D_OBJECT_PATTERNS,
  D_TUPLE,
  D_UNION,
  EXT,
  F_ERROR,
  F_IN_UNION,
  F_PARTIAL_DEEP,
  F_PARTIAL_TOP,
  F_STRIP,
  F_TOP,
  hasRejectSlot,
  INTERP,
  keySlots,
  NUMBER_BITS,
  STRING_BITS,
  type TDef,
  type TKeySlots,
  type TLayout,
  type TSite,
} from './layout'

/** A site's annotation mask / pattern shape and first value slot. */
interface TSiteKeys {
  mask: number
  shape: string
  at: number
}

/** Emission context of one site. */
interface TCtx {
  /** Statement run on FAIL; always leaves the current check. */
  fail: string
  /** {@link fail} where the IN_UNION flag is known to be set. */
  inUnionFail: string
  /** Statically inside a union branch (else: decided at runtime by the IN_UNION flag). */
  union: boolean
  /** Callees run below a prop / item (the TOP flag is cleared). */
  clearTop: boolean
}

const ROOT_CTX: TCtx = { fail: 'return 0', inUnionFail: 'return 0', union: false, clearTop: false }

/** Factory-level helpers (see `TCompiledHelpers`), in declaration order. */
const HELPERS: Array<[name: string, use: RegExp]> = [
  ['pk', /\bpk\./],
  ['ho', /\bho\.call\(/],
  ['dec', /\bdec\.test\(/],
  ['rn', /\brn\(/],
]

/** Source of the check factory `(K, H) => check` of `layout`. */
export function emitCheckFactory(layout: TLayout): string {
  return new CheckEmitter(layout).emit()
}

class CheckEmitter {
  private readonly defs: TDef[]
  /** Def index → emitted as its own function. */
  private readonly fn: boolean[]
  private uid = 0
  /** Calls emitted so far (a union branch without calls cannot record strips). */
  private calls = 0

  constructor(private readonly layout: TLayout) {
    this.defs = layout[0]
    this.fn = this.functionDefs()
  }

  emit(): string {
    const body: string[] = []
    for (let d = 0; d < this.defs.length; d++) {
      if (this.fn[d]) {
        body.push(...this.defFunction(d))
      }
    }
    const root = this.layout[1]
    const rootDef = root[2] >= 0 ? this.defs[root[2]][0] : -1
    if (
      root[0] === 0 &&
      this.fn[root[2]] &&
      (rootDef === D_OBJECT ||
        rootDef === D_OBJECT_PATTERNS ||
        rootDef === D_TUPLE ||
        rootDef === D_INTERSECTION)
    ) {
      // A def without site-level checks: its function is the check.
      body.push(`return d${root[2]}`)
    } else {
      body.push(...this.fnLines('r', () => [...this.site(root, 'v', ROOT_CTX), 'return 1']))
      body.push('return r')
    }
    const code = body.join('\n')
    const head: string[] = []
    const helpers = HELPERS.filter(([, use]) => use.test(code)).map(([h]) => `${h} = H.${h}`)
    if (helpers.length > 0) {
      head.push(`const ${helpers.join(', ')}`)
    }
    const slots = [...new Set(Array.from(code.matchAll(/\bk(\d+)\b/g), m => Number(m[1])))]
      .filter(k => k < this.layout[2])
      .sort((a, b) => a - b)
    for (let i = 0; i < slots.length; i += 16) {
      head.push(
        `const ${slots
          .slice(i, i + 16)
          .map(k => `k${k} = K[${k}]`)
          .join(', ')}`
      )
    }
    return ['(K, H) => {', ...indent([...head, ...body]), '}'].join('\n')
  }

  /**
   * Object defs get a function each; so does every def a reference cycle passes through
   * (each back-edge target of a DFS), which keeps inlining finite.
   */
  private functionDefs(): boolean[] {
    const defs = this.defs
    const fn = defs.map(def => def[0] === D_OBJECT || def[0] === D_OBJECT_PATTERNS)
    const state = Array.from<number>({ length: defs.length }).fill(0)
    const dfs = (d: number) => {
      state[d] = 1
      for (const site of childSites(defs[d])) {
        const c = site[2]
        if (c < 0) {
          continue
        }
        if (state[c] === 1) {
          fn[c] = true
        } else if (state[c] === 0) {
          dfs(c)
        }
      }
      state[d] = 2
    }
    for (let d = 0; d < defs.length; d++) {
      if (state[d] === 0) {
        dfs(d)
      }
    }
    return fn
  }

  private next(prefix: string): string {
    return `${prefix}${this.uid++}`
  }

  // ── functions ─────────────────────────────────────────────────────────────

  /** A check function `name(v, f, o)` declaring the `q` / `t` locals its body uses. */
  private fnLines(name: string, body: () => string[]): string[] {
    const lines = body()
    const code = lines.join('\n')
    const locals: string[] = []
    if (code.includes('if (q) return 0')) {
      locals.push(`const q = (f & ${F_IN_UNION}) === 0`)
    }
    if (/\bt = /.test(code)) {
      locals.push('let t')
    }
    return [`function ${name}(v, f, o) {`, ...indent([...locals, ...lines]), '}']
  }

  private defFunction(d: number): string[] {
    const def = this.defs[d]
    return this.fnLines(`d${d}`, () => {
      switch (def[0]) {
        case D_OBJECT: {
          return this.objectBody(def)
        }
        case D_OBJECT_PATTERNS: {
          // Pattern props are left to the walk.
          return [`if (${notObject('v')}) return 0`, 'return 2']
        }
        case D_ARRAY: {
          // Callers check `Array.isArray` and the site's array constraints first.
          return [...this.items(def[1] as TSite, 'v', ROOT_CTX), 'return 1']
        }
        case D_UNION: {
          // 1: matched a non-literal branch (the caller applies its union-level constraints),
          // 3: matched a literal branch.
          const branches = this.unionBranches(def[1] as TSite[], 'v', false, item => [
            `return ${choose(this.literalExpr(item), '3', '1')}`,
          ])
          return [...branches, 'return 0']
        }
        case D_TUPLE: {
          return [...this.tuple(def[1] as TSite[], 'v', ROOT_CTX), 'return 1']
        }
        case D_INTERSECTION: {
          // The walk stops at the first failing member.
          const members = (def[1] as TSite[]).flatMap(item => this.site(item, 'v', ROOT_CTX))
          return [...members, 'return 1']
        }
        default: {
          // finals and unknown kinds never sit on a cycle
          return ['return 2']
        }
      }
    })
  }

  /** Mirrors `fastCheckObject` (+ `pendStrips` / `hasUnknownKey`). */
  private objectBody(def: TDef): string[] {
    const sites = def[2] as TSite[]
    const props = (def[1] as string[])
      .map((key, i) => ({ key, site: sites[i] }))
      .filter(p => !this.isPhantom(p.site))
    const lines = [
      `if (${notObject('v')}) return 0`,
      // The walk reads the top-level object again after stripping it (an intersection).
      'if (pk.length !== 0) return 2',
    ]
    if (props.some(p => p.site[0] === 0 || p.site[2] === INTERP)) {
      // partial: 'deep', or partial: true at depth 0
      const top = F_PARTIAL_TOP | F_TOP
      lines.push(`const sk = (f & ${F_PARTIAL_DEEP}) !== 0 || (f & ${top}) === ${top}`)
    }
    if (props.length > 0) {
      lines.push('let r = 1')
    }
    for (const { key, site } of props) {
      const p = this.next('P')
      const x = this.next('x')
      const access = validIdentifier.test(key) ? `v.${key}` : `v[${literalSource(key)}]`
      lines.push(`${p}: {`, `  const ${x} = ${access}`)
      if (site[0] === 0 || site[2] === INTERP) {
        lines.push(`  if (${x} === undefined && sk) break ${p}`)
      }
      const ctx = recordingCtx(`r = 0; break ${p}`, false, true)
      lines.push(...indent(this.site(site, x, ctx)), '}')
    }
    if (props.length > 0) {
      // The walk never strips a failing object.
      lines.push('if (r === 0) return 0')
    }
    // Unknown keys, after the props: 'error' fails (outside unions a FAIL may come late, as it
    // ends in the walk; inside, the props must be visited first); 'strip' records the keys
    // of the top-level object (deferred strips) and bails on nested ones.
    const known = props.map(p => p.key)
    const onUnknown = `{ if ((f & ${F_ERROR}) !== 0) return 0; if ((f & ${F_TOP}) === 0) return 2; pk.push(k) }`
    const scan =
      known.length === 0
        ? [`for (const k in v) if (ho.call(v, k)) ${onUnknown}`]
        : [
            'for (const k in v) {',
            '  switch (k) {',
            ...known.map(key => `    case ${literalSource(key)}:`),
            '      break',
            '    default:',
            `      if (ho.call(v, k)) ${onUnknown}`,
            '  }',
            '}',
          ]
    lines.push(`if ((f & ${F_ERROR | F_STRIP}) !== 0) {`, ...indent(scan), '}', 'return 1')
    return lines
  }

  private isPhantom(site: TSite): boolean {
    const d = site[2]
    return d >= 0 && this.defs[d][0] === D_FINAL && this.defs[d][1] === 'phantom'
  }

  private isLiteralDef(d: number): boolean {
    return d >= 0 && this.defs[d][0] === D_FINAL && this.defs[d].length > 2
  }

  /** A required `never` union branch: it can never match (skipped). */
  private isNever(site: TSite): boolean {
    const d = site[2]
    return (
      site[0] === 0 &&
      d >= 0 &&
      this.defs[d][0] === D_FINAL &&
      this.defs[d][1] === 'never' &&
      !this.isLiteralDef(d)
    )
  }

  /** Expression telling whether the site's type is a literal (`'true'` / `'false'` when known). */
  private literalExpr(site: TSite): string {
    const [, , d, , slot] = site
    if (d >= 0) {
      return this.isLiteralDef(d) ? 'true' : 'false'
    }
    // EXT / INTERP: the K slot after the site's check
    return `k${d === INTERP ? slot + 1 : slot + (hasRejectSlot(site) ? 1 : 0) + 1}`
  }

  // ── sites ─────────────────────────────────────────────────────────────────

  /** Mirrors `fastCheck` for one node holding `x`. */
  private site(site: TSite, x: string, ctx: TCtx): string[] {
    const [optional, mask, d, shape, slot] = site
    if (d === INTERP) {
      // Handles `optional` itself.
      return this.call(`k${slot}`, x, ctx)
    }
    let at = slot
    const rej = hasRejectSlot(site) ? at++ : -1
    const body = d === EXT ? this.call(`k${at}`, x, ctx) : this.def(d, mask, shape, at, x, ctx)
    if (!optional) {
      return body
    }
    if (rej < 0) {
      return body.length > 0
        ? [`if (${x} !== undefined && ${x} !== null) {`, ...indent(body), '}']
        : []
    }
    // Mirrors Validator.validateSafe: `null` on an optional `@meta.required` node fails
    // unless its type accepts `null` (decided live on the node).
    const lines = [
      `if (${x} === undefined || ${x} === null) {`,
      `  if (${x} === null && rn(k${rej})) ${ctx.fail}`,
    ]
    if (body.length > 0) {
      lines.push('} else {', ...indent(body))
    }
    lines.push('}')
    return lines
  }

  /** Calls a check function returning 0 / 1 / 2. */
  private call(fn: string, x: string, ctx: TCtx): string[] {
    this.calls++
    return [
      `t = ${fn}(${x}, ${flags(ctx)}, o)`,
      `if (t !== 1) { if (t === 2) return 2; ${unblock(ctx.fail)} }`,
    ]
  }

  private def(d: number, mask: number, shape: string, at: number, x: string, ctx: TCtx): string[] {
    const def = this.defs[d]
    const kind = def[0]
    if (this.fn[d] && kind !== D_ARRAY && kind !== D_UNION) {
      return this.call(`d${d}`, x, ctx)
    }
    switch (kind) {
      case D_FINAL: {
        return this.final(def, mask, shape, at, x, ctx.fail)
      }
      case D_ARRAY: {
        return [
          `if (!Array.isArray(${x})) ${ctx.fail}`,
          ...this.arrayConstraints(mask, keySlots(mask, shape, at), x, ctx.fail),
          ...(this.fn[d] ? this.call(`d${d}`, x, ctx) : this.items(def[1] as TSite, x, ctx)),
        ]
      }
      case D_UNION: {
        const constraints = this.unionConstraints(mask, shape, at, x, ctx.fail)
        if (!this.fn[d]) {
          return this.union(def[1] as TSite[], { mask, shape, at }, constraints, x, ctx)
        }
        this.calls++
        const lines = [
          `t = d${d}(${x}, ${flags(ctx)}, o)`,
          'if (t === 2) return 2',
          `if (t === 0) ${ctx.fail}`,
        ]
        if (constraints.length > 0) {
          lines.push('if (t === 1) {', ...indent(constraints), '}')
        }
        return lines
      }
      case D_INTERSECTION: {
        // The walk stops at the first failing member.
        return (def[1] as TSite[]).flatMap(item => this.site(item, x, ctx))
      }
      case D_TUPLE: {
        return this.tuple(def[1] as TSite[], x, ctx)
      }
      default: {
        // Unknown kind: the walk throws.
        return ['return 2']
      }
    }
  }

  /** Mirrors `fastCheckFinal` + the string / number / boolean constraints. */
  private final(
    def: TDef,
    mask: number,
    shape: string,
    at: number,
    x: string,
    fail: string
  ): string[] {
    const designType = def[1]
    if (designType === 'phantom') {
      return []
    }
    if (def.length > 2) {
      return [`if (${x} !== ${literalSource(def[2])}) ${fail}`]
    }
    const ks = keySlots(mask, shape, at)
    switch (designType) {
      case 'string': {
        return this.stringChecks(mask, shape, ks, x, fail, [`typeof ${x} !== "string"`])
      }
      case 'number': {
        return this.numberChecks(mask, ks, x, fail, [
          `typeof ${x} !== "number"`,
          `!Number.isFinite(${x})`,
        ])
      }
      case 'boolean': {
        const conds = [`typeof ${x} !== "boolean"`]
        if (mask & B_REQUIRED) {
          conds.push(`${x} !== true`)
        }
        return [`if (${conds.join(' || ')}) ${fail}`]
      }
      case 'any': {
        return []
      }
      case 'never': {
        return [fail]
      }
      case 'undefined': {
        return [`if (${x} !== undefined) ${fail}`]
      }
      case 'null': {
        return [`if (${x} !== null) ${fail}`]
      }
      case 'decimal': {
        return [`if (typeof ${x} !== "string" || !dec.test(${x})) ${fail}`]
      }
      default: {
        // Unknown design type (incl. 'object'): the walk throws.
        return ['return 2']
      }
    }
  }

  private stringChecks(
    mask: number,
    shape: string,
    ks: TKeySlots,
    x: string,
    fail: string,
    conds: string[]
  ): string[] {
    if (mask & B_REQUIRED) {
      conds.push(`${x}.trim().length === 0`)
    }
    if (ks.minLength >= 0) {
      conds.push(`${x}.length < k${ks.minLength}`)
    }
    if (ks.maxLength >= 0) {
      conds.push(`${x}.length > k${ks.maxLength}`)
    }
    const lines = conds.length > 0 ? [`if (${conds.join(' || ')}) ${fail}`] : []
    let p = 0
    for (const c of shape) {
      if (c === 'n') {
        lines.push(`if (!k${ks.patterns[p++]}.test(${x})) ${fail}`)
      } else if (c === 's') {
        // Stateful (`lastIndex`) regex: testing here would shift the walk's result.
        lines.push('return 2')
        break
      }
    }
    return lines
  }

  private numberChecks(
    mask: number,
    ks: TKeySlots,
    x: string,
    fail: string,
    conds: string[]
  ): string[] {
    if (mask & B_INT) {
      conds.push(`${x} % 1 !== 0`)
    }
    if (ks.min >= 0) {
      conds.push(`${x} < k${ks.min}`)
    }
    if (ks.max >= 0) {
      conds.push(`${x} > k${ks.max}`)
    }
    if (ks.exMin >= 0) {
      conds.push(`${x} <= k${ks.exMin}`)
    }
    if (ks.exMax >= 0) {
      conds.push(`${x} >= k${ks.exMax}`)
    }
    return conds.length > 0 ? [`if (${conds.join(' || ')}) ${fail}`] : []
  }

  /** Array length constraints; `uniqueItems` (duplicate detection) is left to the walk. */
  private arrayConstraints(mask: number, ks: TKeySlots, x: string, fail: string): string[] {
    const conds: string[] = []
    if (ks.minLength >= 0) {
      conds.push(`${x}.length < k${ks.minLength}`)
    }
    if (ks.maxLength >= 0) {
      conds.push(`${x}.length > k${ks.maxLength}`)
    }
    const lines = conds.length > 0 ? [`if (${conds.join(' || ')}) ${fail}`] : []
    if (mask & B_UNIQUE) {
      lines.push('return 2')
    }
    return lines
  }

  /** Mirrors `fastCheckUnionConstraints` (the caller skips literal branches). */
  private unionConstraints(
    mask: number,
    shape: string,
    at: number,
    x: string,
    fail: string
  ): string[] {
    const ks = keySlots(mask, shape, at)
    const branches: Array<[string, string[]]> = []
    if (mask & STRING_BITS) {
      branches.push([`typeof ${x} === "string"`, this.stringChecks(mask, shape, ks, x, fail, [])])
    }
    if (mask & NUMBER_BITS) {
      branches.push([`typeof ${x} === "number"`, this.numberChecks(mask, ks, x, fail, [])])
    }
    if (mask & B_REQUIRED) {
      branches.push([`typeof ${x} === "boolean"`, [`if (${x} !== true) ${fail}`]])
    }
    if (mask & ARRAY_BITS) {
      branches.push([`Array.isArray(${x})`, this.arrayConstraints(mask, ks, x, fail)])
    }
    const lines: string[] = []
    branches.forEach(([cond, body], i) => {
      lines.push(`${i === 0 ? 'if' : '} else if'} (${cond}) {`, ...indent(body))
    })
    if (lines.length > 0) {
      lines.push('}')
    }
    return lines
  }

  /**
   * The union-level constraints after a non-literal branch passed. A required (non-optional)
   * branch of a known primitive / array type fixes `typeof`: only that part applies.
   */
  private branchConstraints(
    item: TSite,
    { mask, shape, at }: TSiteKeys,
    constraints: string[],
    x: string,
    fail: string
  ) {
    const [optional, , d] = item
    const def = this.defs[d]
    if (optional) {
      return constraints
    }
    const ks = keySlots(mask, shape, at)
    if (def[0] === D_ARRAY) {
      return this.arrayConstraints(mask, ks, x, fail)
    }
    if (def[0] !== D_FINAL) {
      return constraints
    }
    switch (def[1]) {
      case 'string': {
        return this.stringChecks(mask, shape, ks, x, fail, [])
      }
      case 'number': {
        return this.numberChecks(mask, ks, x, fail, [])
      }
      case 'boolean': {
        return mask & B_REQUIRED ? [`if (${x} !== true) ${fail}`] : []
      }
      case 'null':
      case 'undefined': {
        return []
      }
      default: {
        return constraints
      }
    }
  }

  /**
   * Mirrors the `fastCheck` union case: branches in declared order, each a labelled block a
   * FAIL breaks out of; `onMatch` ends a passing branch.
   */
  private unionBranches(
    items: TSite[],
    x: string,
    clearTop: boolean,
    onMatch: (item: TSite) => string[]
  ): string[] {
    const lines: string[] = []
    for (const item of items) {
      if (this.isNever(item)) {
        continue
      }
      const b = this.next('B')
      const calls = this.calls
      const fail = `break ${b}`
      const body = this.site(item, x, { fail, inUnionFail: fail, union: true, clearTop })
      lines.push(`${b}: {`, ...indent([...body, ...onMatch(item)]), '}')
      if (this.calls !== calls) {
        // The walk keeps the strips of a branch it rejects; the next branches would see them.
        lines.push('if (pk.length !== 0) return 2')
      }
    }
    return lines
  }

  /** An inline union: the first matching branch passes after the union-level constraints. */
  private union(
    items: TSite[],
    keys: TSiteKeys,
    constraints: string[],
    x: string,
    ctx: TCtx
  ): string[] {
    const u = this.next('U')
    const branches = this.unionBranches(items, x, ctx.clearTop, item => {
      const lines: string[] = []
      const literal = constraints.length > 0 ? this.literalExpr(item) : 'true'
      if (literal === 'false') {
        lines.push(...this.branchConstraints(item, keys, constraints, x, ctx.fail))
      } else if (literal !== 'true') {
        // Literal branches skip the union-level constraints.
        lines.push(`if (!${literal}) {`, ...indent(constraints), '}')
      }
      lines.push(`break ${u}`)
      return lines
    })
    return [`${u}: {`, ...indent([...branches, ctx.fail]), '}']
  }

  /** Mirrors `checkItems`: every item is visited inside a union (BAIL beats FAIL). */
  private items(of: TSite, x: string, ctx: TCtx): string[] {
    const y = this.next('y')
    const a = this.next('a')
    const body = this.site(of, y, recordingCtx(`${a} = 0; continue`, ctx.union, true))
    if (body.length === 0) {
      // The walk still iterates (a throwing iterator must throw here too).
      return [`for (const ${y} of ${x}) {}`]
    }
    return [
      `let ${a} = 1`,
      `for (const ${y} of ${x}) {`,
      ...indent(body),
      '}',
      // only reachable in a union
      `if (${a} === 0) ${ctx.inUnionFail}`,
    ]
  }

  /** Mirrors the `fastCheck` tuple case: stops at the first non-passing item. */
  private tuple(items: TSite[], x: string, ctx: TCtx): string[] {
    const lines = [`if (!Array.isArray(${x}) || ${x}.length !== ${items.length}) ${ctx.fail}`]
    items.forEach((item, i) => {
      const e = this.next('e')
      // Read even when unchecked: the walk reads every item (a throwing getter must throw here too).
      lines.push(`const ${e} = ${x}[${i}]`, ...this.site(item, e, { ...ctx, clearTop: true }))
    })
    return lines
  }
}

/**
 * Context of a node whose failure is recorded (`record`: e.g. `r = 0; break P1`) when
 * inside a union and leaves the check otherwise.
 */
function recordingCtx(record: string, union: boolean, clearTop: boolean): TCtx {
  const inUnionFail = `{ ${record} }`
  return {
    fail: union ? inUnionFail : `{ if (q) return 0; ${record} }`,
    inUnionFail,
    union,
    clearTop,
  }
}

/** Flags passed to a callee. */
function flags(ctx: TCtx): string {
  if (ctx.clearTop) {
    return ctx.union ? `(f & ${~F_TOP}) | ${F_IN_UNION}` : `f & ${~F_TOP}`
  }
  return ctx.union ? `f | ${F_IN_UNION}` : 'f'
}

/** The statements of a `{ … }` block statement (other statements as they are). */
function unblock(statement: string): string {
  return statement.startsWith('{ ') && statement.endsWith(' }') ? statement.slice(2, -2) : statement
}

/** `cond ? a : b` folded when `cond` is a constant. */
function choose(cond: string, a: string, b: string): string {
  return cond === 'true' ? a : cond === 'false' ? b : `${cond} ? ${a} : ${b}`
}

function notObject(x: string): string {
  return `typeof ${x} !== "object" || ${x} === null || Array.isArray(${x})`
}

function indent(lines: string[], n = 2): string[] {
  const pad = ' '.repeat(n)
  return lines.map(l => pad + l)
}
