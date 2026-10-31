import { HBase, HU } from './hidden-err-b'

export interface HMerged {
  merged: HBase & { extra?: string }
}

export annotate HBase as HView {
  hidden
}

export interface HChild extends HBase {
  extra?: string
}

export interface HMulti {
  merged: HU & { extra?: string }
}
