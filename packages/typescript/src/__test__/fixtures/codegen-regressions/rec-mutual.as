// Mutually recursive intersections: every merge reaches every other one.
export interface I0 {
  v0: string
  n0?: I1 & M0
  k0?: I0 & M1
}

export interface M0 {
  @expect.maxLength 2
  m0?: string
}

export interface I1 {
  v1: string
  n1?: I2 & M1
  k1?: I1 & M2
}

export interface M1 {
  @expect.maxLength 2
  m1?: string
}

export interface I2 {
  v2: string
  n2?: I3 & M2
  k2?: I2 & M3
}

export interface M2 {
  @expect.maxLength 2
  m2?: string
}

export interface I3 {
  v3: string
  n3?: I4 & M3
  k3?: I3 & M4
}

export interface M3 {
  @expect.maxLength 2
  m3?: string
}

export interface I4 {
  v4: string
  n4?: I5 & M4
  k4?: I4 & M5
}

export interface M4 {
  @expect.maxLength 2
  m4?: string
}

export interface I5 {
  v5: string
  n5?: I0 & M5
  k5?: I5 & M0
}

export interface M5 {
  @expect.maxLength 2
  m5?: string
}
