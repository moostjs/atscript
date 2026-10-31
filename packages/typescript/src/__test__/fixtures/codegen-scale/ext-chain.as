// A chain of interfaces, each extending the previous one and intersecting it in a prop: merged
// copies inlined at every level used to grow the output exponentially.
export interface Ch0 { v0?: number }
export interface Ch1 extends Ch0 { v1?: number; r1?: Ch0 & { a1?: string } }
export interface Ch2 extends Ch1 { v2?: number; r2?: Ch1 & { a2?: string } }
export interface Ch3 extends Ch2 { v3?: number; r3?: Ch2 & { a3?: string } }
export interface Ch4 extends Ch3 { v4?: number; r4?: Ch3 & { a4?: string } }
export interface Ch5 extends Ch4 { v5?: number; r5?: Ch4 & { a5?: string } }
export interface Ch6 extends Ch5 { v6?: number; r6?: Ch5 & { a6?: string } }
export interface Ch7 extends Ch6 { v7?: number; r7?: Ch6 & { a7?: string } }
export interface Ch8 extends Ch7 { v8?: number; r8?: Ch7 & { a8?: string } }
export interface Ch9 extends Ch8 { v9?: number; r9?: Ch8 & { a9?: string } }
export interface Ch10 extends Ch9 { v10?: number; r10?: Ch9 & { a10?: string } }
export interface Ch11 extends Ch10 { v11?: number; r11?: Ch10 & { a11?: string } }
export interface Ch12 extends Ch11 { v12?: number; r12?: Ch11 & { a12?: string } }
export interface Ch13 extends Ch12 { v13?: number; r13?: Ch12 & { a13?: string } }
export interface Ch14 extends Ch13 { v14?: number; r14?: Ch13 & { a14?: string } }
export interface Ch15 extends Ch14 { v15?: number; r15?: Ch14 & { a15?: string } }
export interface Ch16 extends Ch15 { v16?: number; r16?: Ch15 & { a16?: string } }
export interface Ch17 extends Ch16 { v17?: number; r17?: Ch16 & { a17?: string } }
export interface Ch18 extends Ch17 { v18?: number; r18?: Ch17 & { a18?: string } }
