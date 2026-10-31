import { HBase } from './hidden-b'

export interface HMerged {
  merged: HBase & { extra?: string }
}

export annotate HBase as HView {
  hidden
}

export interface HChild extends HBase {
  extra?: string
}
