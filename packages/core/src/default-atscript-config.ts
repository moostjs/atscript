/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { metaAnnotations } from './defaults/meta-annotations'
import { primitives } from './defaults/primitives'
import { expectAnnotations } from './defaults/expect-annotations'
import { emitAnnotations } from './defaults/emit-annotations'
import { TAtscriptConfig } from './config'

export function getDefaultAtscriptConfig(): TAtscriptConfig {
  const defaulTAtscriptConfig: TAtscriptConfig = {
    primitives,
    annotations: {
      meta: { ...metaAnnotations },
      expect: { ...expectAnnotations },
      emit: { ...emitAnnotations },
    },
  }

  return defaulTAtscriptConfig
}
