interface Hidden {
  h: string
}

export interface P {
  hidden?: Hidden
}

export interface Q extends P {
  q?: string
}

export type BU = Hidden | string

export type HA = Hidden[]
