import { TAnscriptPlugin } from '@anscript/core'
import { TypeRenderer, JsRenderer } from './codegen'

export const tsPlugin: () => TAnscriptPlugin = () => {
  return {
    name: 'typesccript',
    render(doc, format) {
      if (format === 'dts') {
        return [
          {
            fileName: `${doc.name}.d.ts`,
            content: new TypeRenderer(doc).render(),
          },
        ]
      }
      if (format === 'js') {
        return [
          {
            fileName: `${doc.name}.js`,
            content: new JsRenderer(doc).render(),
          },
        ]
      }
    },
  } as TAnscriptPlugin
}
