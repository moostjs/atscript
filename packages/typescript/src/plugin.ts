import { TAnscriptPlugin } from '@anscript/core'
import { TypeRenderer, JsRenderer } from './codegen'

export const tsPlugin: () => TAnscriptPlugin = () => {
  return {
    name: 'typesccript',
    render(doc, context) {
      return [
        {
          name: context === 'prepare' ? `${doc.name}.d.ts` : `${doc.name}.js`,
          content:
            context === 'prepare' ? new TypeRenderer(doc).render() : new JsRenderer(doc).render(),
        },
      ]
    },
  } as TAnscriptPlugin
}
