import type { TAtscriptConfig } from './config'
import { dbAnnotations } from './defaults/db-annotations'
import { emitAnnotations } from './defaults/emit-annotations'
import { expectAnnotations } from './defaults/expect-annotations'
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { metaAnnotations } from './defaults/meta-annotations'
import { primitives } from './defaults/primitives'
import { uiAnnotations } from './defaults/ui-annotations'

export function getDefaultAtscriptConfig(): TAtscriptConfig {
  const defaulTAtscriptConfig: TAtscriptConfig = {
    primitives,
    annotations: {
      meta: { ...metaAnnotations },
      expect: { ...expectAnnotations },
      emit: { ...emitAnnotations },
      db: { ...dbAnnotations },
      ui: { ...uiAnnotations },
    },
  }

  return defaulTAtscriptConfig
}
