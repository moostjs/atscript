/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { metaAnnotations } from './defaults/meta-annotations'
import { primitives } from './defaults/primitives'
import { expectAnnotations } from './defaults/expect-annotations'
import { TAtscriptConfig } from './config'

export function getDefaultAtscriptConfig(): TAtscriptConfig {
  const defaulTAtscriptConfig: TAtscriptConfig = {
    primitives,
    annotations: {
      meta: { ...metaAnnotations },
      expect: { ...expectAnnotations },
    },
  }

  return defaulTAtscriptConfig
}
